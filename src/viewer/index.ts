import * as BUI from "@thatopen/ui";
import * as OBC from "@thatopen/components";
import * as OBCF from "@thatopen/components-front";
import * as CUI from "@thatopen/ui-obc";
import * as THREE from "three";
import { FragmentsGroup } from "@thatopen/components";

// CRITICAL: Initialize BUI FIRST before any component creation
BUI.Manager.init();

async function exportFragments() {
  if (!fragmentModel) return;
  const fragmentBinary = fragmentModel.export();
  const blob = new Blob([fragmentBinary]);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `model_fragments.frag`;
  a.click();
  URL.revokeObjectURL(url);
}

async function importFragments() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".frag";
  const reader = new FileReader();

  reader.addEventListener("load", async () => {
    const binary = reader.result;
    if (!(binary instanceof ArrayBuffer)) return;

    const fragmentBinary = new Uint8Array(binary);
    const fragments = components.get(OBC.Fragments);

    try {
      await fragments.load(fragmentBinary);
    } catch (error) {
      console.error("Failed to load fragment:", error);
    }
  });

  input.addEventListener("change", () => {
    const filesList = input.files;
    if (!filesList) return;
    reader.readAsArrayBuffer(filesList[0]);
  });
  input.click();
}

function disposeFragments() {
  const fragments = components.get(OBC.Fragments);
  for (const [, group] of fragments.groups) {
    fragments.dispose(group);
  }
  fragmentModel = undefined;
}

async function processModel(model: FragmentsGroup) {
  const indexer = components.get(OBC.IfcRelations);
  await indexer.index(model);

  const classifier = components.get(OBC.Classifier);
  await classifier.classifyBySpatialStructure(model);
  classifier.classifyByEntity(model);

  const classifications = [
    { system: "entities", label: "Entities" },
    { system: "spatialStructures", label: "Spatial Structures" }
  ];

  if (updateClassificationsTree) {
    updateClassificationsTree({ classifications });
  }
}

async function showProperties() {
  if (!fragmentModel) return;

  const highlighter = components.get(OBCF.Highlighter);
  const selection = highlighter.selection.select;
  const indexer = components.get(OBC.IfcRelations);

  if (!selection || Object.keys(selection).length === 0) return;

  for (const [fragmentID, expressIDs] of (selection as any)) {
    for (const id of (expressIDs as any)) {
      const psets = indexer.getRelations(fragmentModel, id, "IsDefinedBy");
      if (psets) {
        for (const expressId of psets) {
          const prop = await fragmentModel.getProperties(expressId);
          console.log(prop);
        }
      }
    }
  }
}

function toggleVisibility() {
  const highlighter = components.get(OBCF.Highlighter);
  const hider = components.get(OBC.Hider);
  const selection = highlighter.selection.select;

  if (!selection || Object.keys(selection).length === 0) return;

  for (const [fragmentID, expressIDs] of (selection as any)) {
    for (const id of (expressIDs as any)) {
      const isVisible = hider.visibility.get(fragmentID)?.has(id) ?? true;
      hider.set(!isVisible, { [fragmentID]: new Set([id]) });
    }
  }
}

function isolateSelection() {
  const highlighter = components.get(OBCF.Highlighter);
  const hider = components.get(OBC.Hider);
  const selection = highlighter.selection.select;
  hider.isolate(selection);
}

function showAll() {
  const hider = components.get(OBC.Hider);
  hider.set(true);
}

function classifier() {
  if (!floatingGrid) return;
  if (floatingGrid.layout !== BUI.FloatingGridLayout.Classifier) {
    floatingGrid.layout = BUI.FloatingGridLayout.Classifier;
  } else {
    floatingGrid.layout = BUI.FloatingGridLayout.Main;
  }
}

function worldUpdate() {
  if (!floatingGrid) return;
  floatingGrid.layout = BUI.FloatingGridLayout.World;
}

let fragmentModel: FragmentsGroup | undefined;
const container = document.getElementById("viewer-container")!;
const components = new OBC.Components();
const worlds = components.get(OBC.Worlds);

// Get tables component properly for v3
const tables = components.get(CUI.Tables);
const [classificationsTree, updateClassificationsTree] = tables.createClassificationTree({
  components,
  classifications: []
});

const world = worlds.create<
  OBC.SimpleScene,
  OBC.OrthoPerspectiveCamera,
  OBCF.PostproductionRenderer
>();

world.scene = new OBC.SimpleScene(components);
world.renderer = new OBCF.PostproductionRenderer(components, container);
world.camera = new OBC.OrthoPerspectiveCamera(components);

components.init();

world.renderer.postproduction.enabled = true;
world.camera.controls.setLookAt(12, 6, 8, 0, 0, -10);
world.camera.updateAspect();
world.scene.setup();
world.scene.three.background = new THREE.Color(0xffffff);

const grids = components.get(OBC.Grids);
grids.create(world);

const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
world.scene.three.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
directionalLight.position.set(10, 20, 5);
world.scene.three.add(directionalLight);

const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.4);
directionalLight2.position.set(-10, -10, -5);
world.scene.three.add(directionalLight2);

const fragments = components.get(OBC.Fragments);
const fragmentIfcLoader = components.get(OBC.IfcLoader);
await fragmentIfcLoader.setup();

fragments.onFragmentsLoaded.add(async (model) => {
  world.scene.three.add(model);
  if (model.hasProperties) {
    await processModel(model);
  }
  fragmentModel = model;
});

const highlighter = components.get(OBCF.Highlighter);
highlighter.setup({ world });
highlighter.zoomToSelection = true;

container.addEventListener("resize", () => {
  world.renderer?.resize();
  world.camera.updateAspect();
});

fragmentIfcLoader.settings.webIfc.COORDINATE_TO_ORIGIN = true;

// Create floating grid AFTER BUI is initialized
const floatingGrid = BUI.Component.create<BUI.Grid>(() => {
  return BUI.html`
    <bim-grid floating style="padding: 20px"></bim-grid>
  `;
});

// Create a simpler, more reliable toolbar
const toolbar = BUI.Component.create<BUI.Toolbar>(() => {
  // Create button using proper v3 syntax
  const loadIfcBtn = CUI.Button.create({
    label: "Load IFC",
    icon: "cloud-upload",
    tooltipTitle: "Load IFC File",
    onClick: () => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".ifc";
      input.onchange = async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (file) {
          const buffer = await file.arrayBuffer();
          const fragments = components.get(OBC.Fragments);
          fragments.load(new Uint8Array(buffer));
        }
      };
      input.click();
    }
  });

  return BUI.html`
    <bim-toolbar style="
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(30, 30, 30, 0.9);
      border-radius: 10px;
      padding: 10px 20px;
      z-index: 10000;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      display: flex;
      gap: 10px;
    ">
      <bim-toolbar-section label="Import">
        ${loadIfcBtn}
      </bim-toolbar-section>
      <bim-toolbar-section label="Fragments">
        <bim-button 
          tooltip-title="Import Fragments" 
          icon="mdi:cube"
          @click=${importFragments}
        ></bim-button>
        <bim-button 
          tooltip-title="Export Fragments" 
          icon="tabler:package-export"
          @click=${exportFragments}
        ></bim-button>
        <bim-button 
          tooltip-title="Dispose" 
          icon="tabler:trash"
          @click=${disposeFragments}
        ></bim-button>
      </bim-toolbar-section>
      <bim-button 
        tooltip-title="Toggle Visibility" 
        icon="mdi:eye"
        @click=${toggleVisibility}
      ></bim-button>
      <bim-button 
        tooltip-title="Isolate Selection" 
        icon="mdi:filter"
        @click=${isolateSelection}
      ></bim-button>
      <bim-button 
        tooltip-title="Show All" 
        icon="tabler:eye-filled"
        @click=${showAll}
      ></bim-button>
      <bim-toolbar-section label="Properties">
        <bim-button 
          tooltip-title="Show Properties" 
          icon="clarity:list-line"
          @click=${showProperties}
        ></bim-button>
      </bim-toolbar-section>
      <bim-toolbar-section label="Views">
        <bim-button 
          tooltip-title="Classifier" 
          icon="tabler:eye-filled"
          @click=${classifier}
        ></bim-button>
        <bim-button 
          tooltip-title="World" 
          icon="tabler:brush"
          @click=${worldUpdate}
        ></bim-button>
      </bim-toolbar-section>
    </bim-toolbar>
  `;
});

// Configure layouts using v3 enums
floatingGrid.layouts = {
  [BUI.FloatingGridLayout.Main]: {
    template: `"empty" 1fr "toolbar" auto / 1fr`,
    elements: { toolbar }
  },
  [BUI.FloatingGridLayout.Secondary]: {
    template: `"empty elementPropertyPanel" 1fr "toolbar toolbar" auto / 1fr 20rem`,
    elements: { 
      toolbar,
      elementPropertyPanel: BUI.Component.create(() => {
        const tables = components.get(CUI.Tables);
        const [propsTable] = tables.elementProperties({ components, fragmentIdMap: {} });
        return BUI.html`<bim-panel>${propsTable}</bim-panel>`;
      })()
    }
  },
  [BUI.FloatingGridLayout.World]: {
    template: `"empty worldPanel" 1fr "toolbar toolbar" auto / 1fr 20rem`,
    elements: { 
      toolbar,
      worldPanel: BUI.Component.create(() => {
        const tables = components.get(CUI.Tables);
        const [worldsTable] = tables.worldsConfiguration({ components });
        return BUI.html`<bim-panel>${worldsTable}</bim-panel>`;
      })()
    }
  },
  [BUI.FloatingGridLayout.Classifier]: {
    template: `"empty classifierPanel" 1fr "toolbar toolbar" auto / 1fr 20rem`,
    elements: { 
      toolbar,
      classifierPanel: BUI.Component.create(() => {
        return BUI.html`
          <bim-panel style="width: 400px;">
            <bim-panel-section name="classifier" label="Classifier" icon="solar:document-bold" fixed>
              <bim-label>Classifications</bim-label>
              ${classificationsTree}
            </bim-panel-section>
          </bim-panel>
        `;
      })()
    }
  }
};

// Set initial layout
floatingGrid.layout = BUI.FloatingGridLayout.Main;

// CRITICAL: Ensure container exists before appending
if (container) {
  container.appendChild(floatingGrid);
} else {
  console.error("Container #viewer-container not found!");
  // Fallback: append to body
  document.body.appendChild(floatingGrid);
}

// Add CSS for proper container sizing
const style = document.createElement("style");
style.textContent = `
  #viewer-container {
    position: relative;
    width: 100vw;
    height: 100vh;
    overflow: hidden;
  }
  bim-toolbar {
    --bim-toolbar_bg: rgba(30, 30, 30, 0.9);
    --bim-button--m--primary_bg: #2196f3;
  }
`;
document.head.appendChild(style);