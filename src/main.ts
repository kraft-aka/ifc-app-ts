import "./style.css";
import * as WEBIFC from "web-ifc";
import * as BUI from "@thatopen/ui";
import * as OBC from "@thatopen/components";
import * as OBCF from "@thatopen/components-front";
import * as THREE from "three";

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

fragmentIfcLoader.settings.webIfc.COORDINATE_TO_ORIGIN = true;

// add bounding box
const fragmentBox = components.get(OBC.BoundingBoxer);
let bbox: THREE.Mesh | null = null;
let model: THREE.Object3D | null = null;

async function loadIfc() {
  const file = await fetch(
    "https://thatopen.github.io/engine_components/resources/small.ifc"
  );
  const data = await file.arrayBuffer();
  const buffer = new Uint8Array(data);
  model = await fragmentIfcLoader.load(buffer);
  world.scene.three.add(model);
  localStorage.setItem('model', JSON.stringify(model));

  fragments.load(model); // check this

  fragmentBox.add(model);
  bbox = fragmentBox.getMesh();
  fragmentBox.reset();
}

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
  let item = localStorage.getItem('model');
  item = ''
  localStorage.setItem('model',item)
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

const panel = BUI.Component.create<BUI.PanelSection>(() => {
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

const button = BUI.Component.create<BUI.PanelSection>(() => {
  return BUI.html`
      <bim-button class="phone-menu-toggler" icon="solar:settings-bold"
        @click="${() => {
      if (panel.classList.contains("options-menu-visible")) {
        panel.classList.remove("options-menu-visible");
      } else {
        panel.classList.add("options-menu-visible");
      }
    }}">
      </bim-button>
    `;
});

document.body.append(button);

/* MD
### 🔴🔵 Classifying your BIM models
---

In this tutorial, you'll learn how to classify your BIM models by different criterias, how to get the list of items that belong to a specific category and how to change their color.

:::tip Why classifications?

Classifications are a powerful way to organize your BIM models. They allow you to group them according to different parameters. For example: getting all the walls, or all the items that belong to a specific floor or room.

:::

In this tutorial, we will import:

- `Three.js` to get some 3D entities for our app.
- `web-ifc` to get some IFC items.
- `@thatopen/ui` to add some simple and cool UI menus.
- `@thatopen/components` to set up the barebone of our app.
- `Stats.js` (optional) to measure the performance of our app.
*/

// import * as THREE from "three";
// import * as BUI from "@thatopen/ui";
// import * as WEBIFC from "web-ifc";
// import * as OBC from "@thatopen/components";

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
//   OBC.SimpleRenderer
// >();

// world.scene = new OBC.SimpleScene(components);
// world.renderer = new OBC.SimpleRenderer(components, container);
// world.camera = new OBC.SimpleCamera(components);

// components.init();

// world.camera.controls.setLookAt(12, 6, 8, 0, 0, -10);

// world.scene.setup();

// const grids = components.get(OBC.Grids);
// grids.create(world);

// /* MD

//   We'll make the background of the scene transparent so that it looks good in our docs page, but you don't have to do that in your app!

// */

// world.scene.three.background = null;

// /* MD
//   ### 🧳 Loading a BIM model
//   ---

//  We'll start by adding a BIM model to our scene. That model is already converted to fragments, so it will load much faster than if we loaded the IFC file.

//   :::tip Fragments?

//     If you are not familiar with fragments, check out the IfcLoader tutorial!

//   :::
// */

// const fragments = new OBC.FragmentsManager(components);
// const file = await fetch(
//   "https://thatopen.github.io/engine_components/resources/small.frag",
// );
// const data = await file.arrayBuffer();
// const buffer = new Uint8Array(data);
// const model = fragments.load(buffer);
// world.scene.three.add(model);

// /* MD
//   ### 🗃️ Classifiying the BIM model
//   ---

//  Next, we will set up a classifier that will help us identify the objects in the scene by their classification (e.g. their spatial structure or their category). Although you can instantiate the classifier by hand, we will use components.get() to get the classifier. All components are meant to be singletons by Components instance, and this method will make sure that this is the case.
// */

// const classifier = components.get(OBC.Classifier);

// /* MD
// Now we can classify the BIM model. The classifier includes 3 methods:
// - `byEntity`: classifies the model by IFC category.
// - `byIfcrel`: classifies the model by an indirect relationship. In this case, we'll classify the model by its spatial structure (project, site, storey an space).
// - `byModel`: classifies the model by model. This might seem redundant, but it's useful if you have multiple BIM models in the same scene and want to quickly select all the objects of one of them.
// */

// classifier.byEntity(model);
// classifier.byIfcRel(model, WEBIFC.IFCRELCONTAINEDINSPATIALSTRUCTURE, "storeys");

// /* MD
// Now, to get the fragments set that belong to a certain classification, we can use the `find()` method. This method allows us to pass an object with filters. For example, to get all items of category "IFCWALLSTANDARDCASE", we can do:
// */

// const walls = classifier.find({
//   entities: ["IFCWALLSTANDARDCASE"],
// });

// /* MD
// Now, let's do that some more times. We'll gather some objects by category to later control its color from a fancy UI that we will build:
// */

// const slabs = classifier.find({
//   entities: ["IFCSLAB"],
// });

// const curtainWalls = classifier.find({
//   entities: ["IFCMEMBER", "IFCPLATE"],
// });

// const furniture = classifier.find({
//   entities: ["IFCFURNISHINGELEMENT"],
// });

// const doors = classifier.find({
//   entities: ["IFCDOOR"],
// });

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
// Now we will add some UI to control the color of the classified elements fetched above. We'll also add a button to reset the color of all items to the original state. For more information about the UI library, you can check the specific documentation for it!
// */

// const color = new THREE.Color();

// const panel = BUI.Component.create<BUI.PanelSection>(() => {
//   return BUI.html`
//     <bim-panel active label="Classifier Tutorial" class="options-menu">
//       <bim-panel-section collapsed label="Controls">

//         <bim-color-input
//           label="Walls Color" color="#202932"
//           @input="${({ target }: { target: BUI.ColorInput }) => {
//             color.set(target.color);
//             classifier.setColor(walls, color);
//           }}">
//         </bim-color-input>

//         <bim-color-input
//           label="Slabs Color" color="#202932"
//           @input="${({ target }: { target: BUI.ColorInput }) => {
//             color.set(target.color);
//             classifier.setColor(slabs, color);
//           }}">
//         </bim-color-input>

//         <bim-color-input
//           label="Curtain walls Color" color="#202932"
//           @input="${({ target }: { target: BUI.ColorInput }) => {
//             color.set(target.color);
//             classifier.setColor(curtainWalls, color);
//           }}">
//         </bim-color-input>

//         <bim-color-input
//           label="Furniture Color" color="#202932"
//           @input="${({ target }: { target: BUI.ColorInput }) => {
//             color.set(target.color);
//             classifier.setColor(furniture, color);
//           }}">
//         </bim-color-input>

//         <bim-color-input
//           label="Doors Color" color="#202932"
//           @input="${({ target }: { target: BUI.ColorInput }) => {
//             color.set(target.color);
//             classifier.setColor(doors, color);
//           }}">
//         </bim-color-input>

//       </bim-panel-section>
//     </bim-panel>
//     `;
// });

// document.body.append(panel);

// /* MD
//   And we will make some logic that adds a button to the screen when the user is visiting our app from their phone, allowing to show or hide the menu. Otherwise, the menu would make the app unusable.
// */

// const button = BUI.Component.create<BUI.PanelSection>(() => {
//   return BUI.html`
//       <bim-button class="phone-menu-toggler" icon="solar:settings-bold"
//         @click="${() => {
//           if (panel.classList.contains("options-menu-visible")) {
//             panel.classList.remove("options-menu-visible");
//           } else {
//             panel.classList.add("options-menu-visible");
//           }
//         }}">
//       </bim-button>
//     `;
// });

// document.body.append(button);

// /* MD
//   ### 🎉 Wrap up
//   ---

//   That's it! You have classified the items of a BIM model by IFC Category, by spatial structure and by model. You can now use the classifier to quickly access the items of one or many BIM models by specific filters.
// */
