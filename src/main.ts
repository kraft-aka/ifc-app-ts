import "./style.css";
import * as WEBIFC from "web-ifc";
import * as BUI from "@thatopen/ui";
import * as OBC from "@thatopen/components";
import * as OBCF from "@thatopen/components-front";
import * as THREE from "three";
import * as CUI from "@thatopen/ui-obc";

const container = document.getElementById("app")!;

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

fragmentIfcLoader.settings.webIfc.COORDINATE_TO_ORIGIN = false;

// add bounding box
const fragmentBox = components.get(OBC.BoundingBoxer);
let bbox: THREE.Mesh | null = null;
let model: THREE.Object3D | null = null;

fragments.onFragmentsLoaded.add((model) => {
  if (world.scene) {
    world.scene.three.add(model);
    world.meshes.add(model);
    fragmentBox.add(model);
    bbox = fragmentBox.getMesh();
    fragmentBox.reset();
    console.log("model:", model);
  }
});

// classification tree
const [classificationsTree, updateClassificationsTree] =
  CUI.tables.classificationTree({
    components,
    classifications: [],
  });

const classifier = components.get(OBC.Classifier);

fragments.onFragmentsLoaded.add(async (model) => {
  classifier.byEntity(model);
  await classifier.byPredefinedType(model);

  const classifications = [
    { system: "entities", label: "Entities" },
    // { system: "predefinedTypes", label: "Predefined Types" },
  ];

  updateClassificationsTree({ classifications });
});

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

// clipper
const raycaster = components.get(OBC.Raycasters);
raycaster.get(world);

const clipper = components.get(OBC.Clipper);
clipper.enabled = true;
console.log(clipper)

const edges = components.get(OBCF.ClipEdges);
clipper.Type = OBCF.EdgesPlane;

container.ondblclick = () => {
  if (clipper.enabled) {
    clipper.create(world);
    console.log("clipper placed");
  }
};

window.onkeydown = (e) => {
  if (e.code === "Delete" || e.code === "Backspace") {
    if (clipper.enabled) {
      clipper.deleteAll(world);
      console.log("clipper deleted");
    }
  }
};

const blueFill = new THREE.MeshBasicMaterial({ color: "lightblue", side: 2 });
const blueLine = new THREE.LineBasicMaterial({ color: "blue" });
const blueOutline = new THREE.MeshBasicMaterial({
  color: "blue",
  opacity: 0.5,
  side: 2,
  transparent: true,
});

edges.styles.create(
  "Red lines",
  new Set(model),
  world,
  blueLine,
  blueFill,
  blueOutline,
);

// TODO: FIX CLIPPING PLANE

// add measuring tool

// const dimensions = components.get(OBCF.LengthMeasurement);
// dimensions.world = world;
// dimensions.enabled = true;
// dimensions.snapDistance = 0.1;

// container.ondblclick = () => dimensions.create();

// window.onkeydown = (e) => {
//   if (e.code === "Delete" || e.code === "Backspace") {
//     dimensions.delete(world);
//   }
// };

// Classifier
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
      }
    );
  }
}

const panel = BUI.Component.create<BUI.PanelSection>(() => {
  const [loadIfcBtn] = CUI.buttons.loadIfc({ components });
  return BUI.html`
  <bim-panel active label="IFC-APP-TS" class="options-menu">
    <bim-panel-section collapsed label="Controls">
      <bim-panel-section style="padding-top: 12px;">

      <bim-panel-section label="Importing">
      ${loadIfcBtn}
    </bim-panel-section>
    <bim-panel-section label="Classifications">
      ${classificationsTree}
    </bim-panel-section>
            
        <bim-button label="Export fragments"
          @click="${() => {
      exportFragments();
    }}">

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

      <bim-panel-section collapsed label="Dimensions">
      <bim-checkbox checked label="Dimensions enabled" 
        @change="${({ target }: { target: BUI.Checkbox }) => {
      dimensions.enabled = target.value;
    }}">  
      </bim-checkbox>       
      <bim-checkbox checked label="Dimensions visible" 
        @change="${({ target }: { target: BUI.Checkbox }) => {
      dimensions.visible = target.value;
    }}">  
      </bim-checkbox>  
      
      <bim-color-input 
        label="Dimensions Color" color="#202932" 
        @input="${({ target }: { target: BUI.ColorInput }) => {
      dimensions.color.set(target.color);
    }}">
      </bim-color-input>
      
      <bim-button label="Delete all"
        @click="${() => {
      dimensions.deleteAll();
    }}">
      </bim-button>

    </bim-panel-section>
     
      <bim-panel-section collapsed label="Colors">
      
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
      
    <bim-checkbox label="Clipper enabled" checked 
      @change="${({ target }: { target: BUI.Checkbox }) => {
      clipper.enabled = target.value;
    }}">
    </bim-checkbox>
    
    <bim-checkbox label="Clipper visible" checked 
      @change="${({ target }: { target: BUI.Checkbox }) => {
      clipper.visible = target.value;
    }}">
    </bim-checkbox>
  
    <bim-color-input 
      label="Planes Color" color="#202932" 
      @input="${({ target }: { target: BUI.ColorInput }) => {
      clipper.material.color.set(target.color);
    }}">
    </bim-color-input>
    
    <bim-number-input 
      slider step="0.01" label="Planes opacity" value="0.2" min="0.1" max="1"
      @change="${({ target }: { target: BUI.NumberInput }) => {
      clipper.material.opacity = target.value;
    }}">
    </bim-number-input>
    
    <bim-number-input 
      slider step="0.1" label="Planes size" value="5" min="2" max="10"
      @change="${({ target }: { target: BUI.NumberInput }) => {
      clipper.size = target.value;
    }}">
    </bim-number-input>  
    <bim-button 
          label="Delete all" 
          @click="${() => {
      clipper.deleteAll();
    }}">  
        </bim-button>       
    </bim-panel>
  `;
});

document.body.append(panel);

/* MD
### 📐 Measuring lengths
---

Space control is one of the most important elements of BIM applications. In this tutorial, you'll learn how to expose a length measurement tool to your end users.

We will import:

- `three` to create some 3D items.
- `@thatopen/components` to set up the barebone of our app.
- `@thatopen/components-front` to use some frontend-oriented components.
- `@thatopen/ui` to add some simple and cool UI menus.
- `Stats.js` (optional) to measure the performance of our app.
*/

// import * as OBC from "@thatopen/components";
// import * as THREE from "three";
// import * as BUI from "@thatopen/ui";
// import * as OBCF from "@thatopen/components-front";

// /* MD
//   ### 🌎 Setting up a simple scene
//   ---

//   We will start by creating a simple scene with a camera and a renderer. If you don't know how to set up a scene, you can check the Worlds tutorial.
// */

// const container = document.getElementById("app")!;

// const components = new OBC.Components();

// const worlds = components.get(OBC.Worlds);

// const world = worlds.create<
//   OBC.SimpleScene,
//   OBC.SimpleCamera,
//   OBCF.PostproductionRenderer
// >();

// world.scene = new OBC.SimpleScene(components);
// world.renderer = new OBCF.PostproductionRenderer(components, container);
// world.camera = new OBC.SimpleCamera(components);

// components.init();

// world.camera.controls.setLookAt(5, 5, 5, 0, 0, 0);

// world.scene.setup();

// const grids = components.get(OBC.Grids);
// grids.create(world);

// /* MD

//   We'll make the background of the scene transparent so that it looks good in our docs page, but you don't have to do that in your app!

// */

// world.scene.three.background = null;

// /* MD
//   ### 🎲 Creating a Cube Mesh
//   ---
//   For this tutorial we will use a Cube, you can add any geometry as per your preference. We will create a [Cube](https://threejs.org/docs/index.html?q=box#api/en/geometries/BoxGeometry) with `3x3x3` dimensions and use red color for the material.
// */

// const cubeGeometry = new THREE.BoxGeometry(3, 3, 3);
// const cubeMaterial = new THREE.MeshStandardMaterial({ color: "#6528D7" });
// const cube = new THREE.Mesh(cubeGeometry, cubeMaterial);
// cube.position.set(0, 1.5, 0);
// world.scene.three.add(cube);
// world.meshes.add(cube);

// /* MD
//   ### 🛠️ Getting the length measurements
//   ---

//   First, let's get an instance of the length measurement component and initialize it:
// */

// const dimensions = components.get(OBCF.LengthMeasurement);
// dimensions.world = world;
// dimensions.enabled = true;
// dimensions.snapDistance = 1;

// /* MD
//   ### 🖱️ Setting up mouse events
//   ---

//   Now, we'll define how to create the length dimensions. In this case, we'll keep it simple and use the double click event of the container HTML element.
// */

// container.ondblclick = () => dimensions.create();

// /* MD

//   ### 🧹 Deleting the Dimensions
//   ---

//   Now that we know how to make multiple dimensions, we'll learn how to delete them when necessary. Dimensions can be removed using the `deleteAll()` method, which deletes all the created dimensions. You can also use `delete` to just remove the dimension under the mouse cursor. Again, we'll keep it simple and bind this event to the keydown event. Specifically, it will fire when the user presses the `Delete` or `Backspace` key.
// */

// window.onkeydown = (event) => {
//   if (event.code === "Delete" || event.code === "Backspace") {
//     dimensions.delete();
//   }
// };

// /* MD
//   ### ⏱️ Measuring the performance (optional)
//   ---

//   We'll use the [Stats.js](https://github.com/mrdoob/stats.js) to measure the performance of our app. We will add it to the top left corner of the viewport. This way, we'll make sure that the memory consumption and the FPS of our app are under control.
// */

// /* MD
//   ### 🧩 Adding some UI
//   ---

//   We will use the `@thatopen/ui` library to add some simple and cool UI elements to our app. First, we need to call the `init` method of the `BUI.Manager` class to initialize the library:
// */

// BUI.Manager.init();

// /* MD
// Now we will add some UI to have some control over the dimensions we create. For more information about the UI library, you can check the specific documentation for it!
// */

// const panel = BUI.Component.create<BUI.PanelSection>(() => {
//   return BUI.html`
//   <bim-panel active label="Length Measurement Tutorial" class="options-menu">
//       <bim-panel-section collapsed label="Controls">
//           <bim-label>Create dimension: Double click</bim-label>
//           <bim-label>Delete dimension: Delete</bim-label>
//       </bim-panel-section>

//       <bim-panel-section collapsed label="Others">
//         <bim-checkbox checked label="Dimensions enabled"
//           @change="${({ target }: { target: BUI.Checkbox }) => {
//             dimensions.enabled = target.value;
//           }}">
//         </bim-checkbox>
//         <bim-checkbox checked label="Dimensions visible"
//           @change="${({ target }: { target: BUI.Checkbox }) => {
//             dimensions.visible = target.value;
//           }}">
//         </bim-checkbox>

//         <bim-color-input
//           label="Dimensions Color" color="#202932"
//           @input="${({ target }: { target: BUI.ColorInput }) => {
//             dimensions.color.set(target.color);
//           }}">
//         </bim-color-input>

//         <bim-button label="Delete all"
//           @click="${() => {
//             dimensions.deleteAll();
//           }}">
//         </bim-button>

//       </bim-panel-section>
//     </bim-panel>
//     `;
// });

// document.body.append(panel);

// /* MD
//   And we will make some logic that adds a button to the screen when the user is visiting our app from their phone, allowing to show or hide the menu. Otherwise, the menu would make the app unusable.
// */

// /* MD
//   ### 🎉 Wrap up
//   ---

//   That's it! You have created an app that can create and delete length measurements on any 3D object. Congratulations!
// */
