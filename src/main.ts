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

world.camera.controls.setLookAt(30, 5, 45, 0, 0, -10);
world.renderer.postproduction.enabled = true;

world.scene.setup();

const grids = components.get(OBC.Grids);
const grid = grids.create(world);

world.renderer.postproduction.customEffects.excludedMeshes.push(grid.three);

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

const fragmentBox = components.get(OBC.BoundingBoxer);
let bbox: THREE.Mesh | null = null;
let model: THREE.Object3D | null = null;

// relations indexer to display properties of selected element
const indexer = components.get(OBC.IfcRelationsIndexer);

fragments.onFragmentsLoaded.add(async (model) => {
  if (world.scene) {
    world.scene.three.add(model);
    world.meshes.add(model);
    await indexer.process(model);
    fragmentBox.add(model);
    bbox = fragmentBox.getMesh();
    fragmentBox.reset();
    console.log("model:", model);
  }
});
// add bounding box

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

const [propertiesTable, updatePropertiesTable] = CUI.tables.elementProperties({
  components,
  fragmentIdMap: {},
});

propertiesTable.preserveStructureOnFilter = true;
propertiesTable.indentationInText = false;

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

highligher.events.select.onHighlight.add((fragmentIdMap) => {
  // outliner.clear("outline");
  // outliner.add("outline", fragmentIdMap);
  updatePropertiesTable(fragmentIdMap);
});

highligher.events.select.onClear.add(() => {
  // outliner.clear("outline");
  updatePropertiesTable({ fragmentIdMap: {} });
});

// clipper
const raycaster = components.get(OBC.Raycasters);
raycaster.get(world);

const clipper = components.get(OBC.Clipper);
clipper.enabled = true;
console.log(clipper);

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
  blueOutline
);

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

const propertiesPanel = BUI.Component.create(() => {
  const onTextInput = (e: Event) => {
    const input = e.target as BUI.TextInput;
    propertiesTable.queryString = input.value !== "" ? input.value : null;
  };

  const expandTable = (e: Event) => {
    const button = e.target as BUI.Button;
    propertiesTable.expanded = !propertiesTable.expanded;
    button.label = propertiesTable.expanded ? "Collapse" : "Expand";
  };

  const copyAsTSV = async () => {
    await navigator.clipboard.writeText(propertiesTable.tsv);
  };

  return BUI.html`
    <bim-panel label="Properties">
      <bim-panel-section label="Element Data">
        <div style="display: flex; gap: 0.5rem;">
          <bim-button @click=${expandTable} label=${
    propertiesTable.expanded ? "Collapse" : "Expand"
  }></bim-button> 
          <bim-button @click=${copyAsTSV} label="Copy as TSV"></bim-button> 
        </div> 
        <bim-text-input @input=${onTextInput} placeholder="Search Property" debounce="250"></bim-text-input>
        ${propertiesTable}
      </bim-panel-section>
    </bim-panel>
  `;
});

document.body.append(propertiesPanel);
