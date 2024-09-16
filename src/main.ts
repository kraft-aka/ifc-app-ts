import "./style.css";
import * as WEBIFC from "web-ifc";
import * as BUI from "@thatopen/ui";
import * as OBC from "@thatopen/components";
import * as OBCF from "@thatopen/components-front";
import * as THREE from "three";

const container = document.getElementById("app");

const components = new OBC.Components();

const worlds = components.get(OBC.Worlds);

const world = worlds.create<
  OBC.SimpleScene,
  OBC.SimpleCamera,
  OBCF.PostproductionRenderer
>();

world.scene = new OBC.SimpleScene(components);
world.renderer = new OBCF.PostproductionRenderer(components, container);
world.camera = new OBC.SimpleCamera(components);

components.init();

world.camera.controls.setLookAt(12, 6, 8, 0, 0, -10);
world.renderer.postproduction.enabled = true;

world.scene.setup();

const grids = components.get(OBC.Grids);
const grid = grids.create(world);

world.renderer.postproduction.customEffects.excludedMeshes.push(grid.three);

// global color
const color = new THREE.Color("#202932");

// sets the background of the scene to transparent
// world.scene.three.background = null;

// Add UI
BUI.Manager.init();

// setup IFC loader
const fragments = components.get(OBC.FragmentsManager);
const fragmentIfcLoader = components.get(OBC.IfcLoader);
await fragmentIfcLoader.setup();

const exludedCats = [
  WEBIFC.IFCTENDONANCHOR,
  WEBIFC.IFCREINFORCINGBAR,
  WEBIFC.IFCREINFORCINGELEMENT,
];

for (const cat of exludedCats) {
  fragmentIfcLoader.settings.excludedCategories.add(cat);
}

fragmentIfcLoader.settings.webIfc.COORDINATE_TO_ORIGIN = true;

// add bounding box
const fragmentBox = components.get(OBC.BoundingBoxer);
let bbox: THREE.Mesh | null = null;
let model: THREE.Object3D | null = null;

async function loadIfc() {
  fragments.onFragmentsLoaded.add((m) => {
    if (world.scene) world.scene.three.add(m);
  });
  // fragments.load(model); // check this
  // fragmentBox.add(model);
  bbox = fragmentBox.getMesh();
  fragmentBox.reset();
}

const input = document.getElementById("file-input");
input?.addEventListener("change", loadIfc);

function download(file: File) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(file);
  link.download = file.name;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

async function exportFragments() {
  if (!fragments.groups.size) {
    return;
  }
  const group = Array.from(fragments.groups.values())[0];
  const data = fragments.export(group);
  download(new File([new Blob([data])], "small.frag"));

  const properties = group.getLocalProperties();
  if (properties) {
    download(new File([JSON.stringify(properties)], "small.json"));
  }
}

// cleans the memory
function disposeFragments() {
  let item = localStorage.getItem("model");
  item = "";
  localStorage.setItem("model", item);
  fragments.dispose();
}

const componentClassifier = components.get(OBC.Classifier);

let walls: THREE.Mesh | null = null;
let slabs: THREE.Mesh | null = null;
let doors: THREE.Mesh | null = null;
let allItems: THREE.Mesh | null = null;

if (model) {
  componentClassifier.byEntity(model);
  console.log("first!");
  componentClassifier.byIfcRel(
    model,
    WEBIFC.IFCRELCONTAINEDINSPATIALSTRUCTURE,
    "storeys"
  );
  console.log("second!!");
  componentClassifier.byModel(model.uuid, model);
  console.log("third!!!");

  walls = componentClassifier.find({
    entities: ["IFCWALLSTANDARDCASE"],
  });

  slabs = componentClassifier.find({
    entities: ["IFCSLAB"],
  });

  doors = componentClassifier.find({
    entities: ["IFCDOOR"],
  });

  allItems = componentClassifier.find({
    models: [model.uuid],
  });
} else {
  console.log("Model is not uploaded!");
}

//TODO:
// IFX componetClassifier

// Highligher------------------------
const highligher = components.get(OBCF.Highlighter);
highligher.setup({ world });
highligher.zoomToSelection = true;

// Outliner, sets outline on click event --- disabled
const outliner = components.get(OBCF.Outliner);
outliner.world = world;
outliner.enabled = false;

outliner.create(
  "outline",
  new THREE.MeshBasicMaterial({
    color: "#ccc",
    transparent: true,
    opacity: 0.5,
  })
);

highligher.events.select.onHighlight.add((data) => {
  outliner.clear("outline");
  outliner.add("outline", data);
});

highligher.events.select.onClear.add(() => {
  outliner.clear("outline");
});

console.log(walls);
console.log(componentClassifier);

function showComment() {
  const ifcCanvas = container?.querySelector("canvas");
  if (ifcCanvas) {
    //const dataURL = ifcCanvas.toDataURL('jpeg');
    const w: number = ifcCanvas.width;
    const h: number = ifcCanvas.height;
    world.renderer?.three.render(world.scene.three, world.camera.three);
    const gl = ifcCanvas.getContext("webgl2");
    const imageData = new ImageData(w, h);

    gl?.readPixels(
      0,
      0,
      gl.drawingBufferWidth,
      gl.drawingBufferHeight,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      imageData.data
    );

    createImageBitmap(imageData, { imageOrientation: "flipY" }).then(
      (image) => {
        const canvas: HTMLCanvasElement = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx: CanvasRenderingContext2D = canvas.getContext("2d")!;
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(image, 0, 0, w, h);

        container?.appendChild(canvas);
        console.log(ifcCanvas, w, h);
        enableCommentDrawing(canvas);
      }
    );
  }

  function enableCommentDrawing(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    let isDrawing = false;
    let startX = 0;
    let startY = 0;
    let currentX = 0;
    let currentY = 0;
    let savedImageData: ImageData | null = null;
    let clouds: {
      x: number;
      y: number;
      width: number;
      height: number;
      text: string;
    }[] = [];

    function drawCommentCloud(
      ctx: CanvasRenderingContext2D,
      x: number,
      y: number,
      width: number,
      height: number,
      comment: string = ""
    ) {
      const radius = 20;
      const tailHeight = 20;
      const tailWidth = 30;
      const padding = 10;

      ctx.beginPath();
      ctx.moveTo(x + radius, y);
      ctx.lineTo(x + width - radius, y);
      ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
      ctx.lineTo(x + width, y + height - radius);
      ctx.quadraticCurveTo(
        x + width,
        y + height,
        x + width - radius,
        y + height
      );

      // Tail
      ctx.lineTo(x + width / 2 + tailWidth / 2, y + height);
      ctx.lineTo(x + width / 2, y + height + tailHeight);
      ctx.lineTo(x + width / 2 - tailWidth / 2, y + height);

      ctx.lineTo(x + radius, y + height);
      ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
      ctx.lineTo(x, y + radius);
      ctx.quadraticCurveTo(x, y, x + radius, y);
      ctx.closePath();

      // Border
      ctx.strokeStyle = "red";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Add text if provided
      if (comment) {
        ctx.fillStyle = "red";
        ctx.font = "16px Arial";
        ctx.fillText(
          comment,
          x + padding,
          y + padding + 16,
          width - 2 * padding
        );
      }
    }

    // Mouse down event - Start drawing the cloud
    canvas.addEventListener("mousedown", (e) => {
      isDrawing = true;
      const rect = canvas.getBoundingClientRect();
      startX = e.clientX - rect.left;
      startY = e.clientY - rect.top;

      savedImageData =
        ctx?.getImageData(0, 0, canvas.width, canvas.height) || null;
    });

    // Mouse move event - Update the cloud size while drawing
    canvas.addEventListener("mousemove", (e) => {
      if (!isDrawing) return;
      const rect = canvas.getBoundingClientRect();
      currentX = e.clientX - rect.left;
      currentY = e.clientY - rect.top;

      if (savedImageData) {
        ctx?.putImageData(savedImageData, 0, 0);
      }
    });

    // Mouse up event - Finish drawing the cloud
    canvas.addEventListener("mouseup", (e) => {
      if (!isDrawing) return;
      isDrawing = false;

      // Finalize the cloud size and add some default text
      const width = currentX - startX;
      const height = currentY - startY;
      clouds.push({ x: startX, y: startY, width, height, text: "" });
      // drawCommentCloud(ctx!, startX, startY, width, height, 'Your Comment Here');
    });

    // Click to enter text inside the cloud
    canvas.addEventListener("click", (e) => {
      const rect = canvas.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;

      // Check if the click was inside any of the drawn clouds
      for (let i = 0; i < clouds.length; i++) {
        const cloud = clouds[i];
        if (
          clickX > cloud.x &&
          clickX < cloud.x + cloud.width &&
          clickY > cloud.y &&
          clickY < cloud.y + cloud.height
        ) {
          // Prompt the user for text input
          const userText = prompt("Enter your comment:", cloud.text || "");
          if (userText !== null) {
            // Update the cloud's text
            cloud.text = userText;

            // Restore the canvas content and redraw only the text inside the cloud
            ctx?.putImageData(savedImageData!, 0, 0);

            // Redraw all clouds without text
            clouds.forEach((c) => {
              drawCommentCloud(ctx!, c.x, c.y, c.width, c.height);
            });

            // Now, add the text inside the specific cloud
            const padding = 10;
            ctx!.fillStyle = "black";
            ctx!.font = "16px Arial";
            ctx!.fillText(
              cloud.text,
              cloud.x + padding,
              cloud.y + padding + 16,
              cloud.width - 2 * padding
            );
          }
          break;
        }
      }
    });

    // Handle case where mouse leaves canvas while drawing
    canvas.addEventListener("mouseleave", () => {
      if (isDrawing) {
        isDrawing = false;
      }
    });
  }
  // TODO: FIX THIS FUNCTION
}

const panel = BUI.Component.create<BUI.PanelSection>(() => {
  // const [loadIfcBtn] = CUI.buttons.loadIfc({ components });
  return BUI.html`
  <bim-panel active label="IFC-APP-TS" class="options-menu">
    <bim-panel-section collapsed label="Controls">
      <bim-panel-section style="padding-top: 12px;">
      
        <bim-button label="Load IFC"
          @click="${() => {
            loadIfc();
          }}">
        </bim-button>  
            
        <bim-button label="Export fragments"
          @click="${() => {
            exportFragments();
          }}">
    </bim-button> 

    <bim-button label="Refresh scene"
          @click="${() => {
            disposeFragments();
          }}">
        </bim-button> 
        
        <bim-button 
        label="Fit BIM model" 
        @click="${() => {
          if (bbox) {
            world.camera.controls.fitToSphere(bbox, true);
          } else {
            console.log("Bound ing box is not available to fit this camera!");
          }
        }}">  
      </bim-button>  
      <bim-button 
        label="Comment" 
        @click="${() => {
          showComment();
        }}">  
      </bim-button>  

      
      </bim-panel-section>
      <bim-panel-section collapsed label="Controls">
      
        <bim-color-input 
          label="Walls Color" 
          @input="${({ target }: { target: BUI.ColorInput }) => {
            color.set(target.color);
            componentClassifier.setColor(walls, color);
          }}">
        </bim-color-input>
      
        <bim-color-input 
          label="Slabs Color"  
          @input="${({ target }: { target: BUI.ColorInput }) => {
            color.set(target.color);
            componentClassifier.setColor(slabs, color);
          }}">
        </bim-color-input>

        <bim-color-input 
        label="Slabs Color"  
        @input="${({ target }: { target: BUI.ColorInput }) => {
          color.set(target.color);
          componentClassifier.setColor(doors, color);
        }}">
      </bim-color-input>
 
        <bim-button 
          label="Reset walls color" 
          @click="${() => {
            componentClassifier.resetColor(allItems);
          }}">  
        </bim-button>

      </bim-panel-section>
      
    </bim-panel>
  `;
});

document.body.append(panel);

// import * as OBC from "@thatopen/components";
// import * as BUI from "@thatopen/ui";
// import * as CUI from "../..";

// BUI.Manager.init();

// const components = new OBC.Components();

// const viewport = document.createElement("bim-viewport");
// viewport.name = "viewer";

// const worlds = components.get(OBC.Worlds);
// const world = worlds.create();

// const sceneComponent = new OBC.SimpleScene(components);
// sceneComponent.setup();
// world.scene = sceneComponent;

// const rendererComponent = new OBC.SimpleRenderer(components, viewport);
// world.renderer = rendererComponent;

// const cameraComponent = new OBC.SimpleCamera(components);
// world.camera = cameraComponent;

// viewport.addEventListener("resize", () => {
//   rendererComponent.resize();
//   cameraComponent.updateAspect();
// });

// const viewerGrids = components.get(OBC.Grids);
// viewerGrids.create(world);

// components.init();

// const ifcLoader = components.get(OBC.IfcLoader);
// await ifcLoader.setup();

// const fragmentsManager = components.get(OBC.FragmentsManager);
// fragmentsManager.onFragmentsLoaded.add((model) => {
//   if (world.scene) world.scene.three.add(model);
// });

// /* MD 
//   ## Displaying elements grouping 📦
//   ---
//   One of the greatest things we can make using BIM models is to group elements based on their properties. This has many use cases! Like grouping elements to check their collisions 💥, grouping elements based on their construction activities 🔨, or grouping fininshed elements during the construction phase ✅. 
  
//   Other than grouping the elements, the next most important thing is to show them to your user in an easy way... well, here is where it comes the `ClassificationsTree` functional component!

//   ### Creating the classifications tree
//   First things first, let's create an instance of the functional component, like this:
//   */

// const [classificationsTree, updateClassificationsTree] =
//   CUI.tables.classificationTree({
//     components,
//     classifications: [],
//   });

// /* MD 
//   Now that we have the classifications tree created, let's tell the `FragmentsManager` that each time a model is loaded it needs to classify the model based on some conditions, but more importantly is that right after those classifications are made it needs to update the classifications tree!
//   */

// const classifier = components.get(OBC.Classifier);

// fragmentsManager.onFragmentsLoaded.add(async (model) => {
//   // This creates a classification system named "entities"
//   classifier.byEntity(model);

//   // This creates a classification system named "predefinedTypes"
//   await classifier.byPredefinedType(model);

//   // This classifications in the state of the classifications tree.
//   // Is an array with the classification systems to be shown.
//   // You can pass the system name directly, or an object with system and label keys.
//   // The system key is the name in the classifier, and the label is how you want it to be shown in the table.
//   const classifications = [
//     { system: "entities", label: "Entities" },
//     { system: "predefinedTypes", label: "Predefined Types" },
//   ];

//   updateClassificationsTree({ classifications });
// });

// /* MD
//   The `classifications` value is just an array of the classification systems from the Classifier that you want to display in the user interface, where `system` is the name in `classifier.list` and `label` is the name you want to use to display in the UI. Needless to say, the classifications need to be computed before they can be used on the tree.
  
//   Great! As we already told the UI when it needs to update, let's add the classifications tree to the HTML page. For it, let's create simple BIM panel component where we include the tree and also a pre-made IFC load button 👇
//   */

// const panel = BUI.Component.create(() => {
//   const [loadIfcBtn] = CUI.buttons.loadIfc({ components });

//   return BUI.html`
//    <bim-panel label="Classifications Tree">
//     <bim-panel-section label="Importing">
//       ${loadIfcBtn}
//     </bim-panel-section>
//     <bim-panel-section label="Classifications">
//       ${classificationsTree}
//     </bim-panel-section>
//    </bim-panel> 
//   `;
// });

// /* MD
//   Finally, let's append the BIM Panel to the page to see the classifications tree working 😉
//   */

// const app = document.createElement("bim-grid");
// app.layouts = {
//   main: {
//     template: `
//       "panel viewport"
//       / 23rem 1fr
//     `,
//     elements: { panel, viewport },
//   },
// };

// app.layout = "main";
// document.body.append(app);

// /* MD
//   Congratulations! You've now a ready to go user interface that let's you show your model classifications. 🥳
//   */

