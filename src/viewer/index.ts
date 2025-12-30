import * as BUI from "@thatopen/ui";
import * as OBC from "@thatopen/components";
import * as OBCF from "@thatopen/components-front";
import * as CUI from "@thatopen/ui-obc";
import * as THREE from "three";

/**
 * BIM 3D Viewer using That Open v3.x - Core functionality
 * Updated for v3.x API compatibility
 * Note: Classification tables API has changed in v3.x
 */

async function exportFragments() {
  if (!fragmentModel) return;
  try {
    const fragmentBinary = fragmentModel.export();
    const blob = new Blob([fragmentBinary]);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `model_fragments.frag`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (e) {
    console.error("Export error:", e);
  }
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
    const fragmentsManager = components.get(OBC.FragmentsManager);
    try {
      await (fragmentsManager as any).load(fragmentBinary);
    } catch (e) {
      console.error("Import error:", e);
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
  const fragmentsManager = components.get(OBC.FragmentsManager);
  try {
    for (const [, group] of (fragmentsManager as any).groups) {
      (fragmentsManager as any).disposeGroup(group);
    }
  } catch (e) {
    console.error("Dispose error:", e);
  }
  fragmentModel = undefined;
}

async function processModel(model: any) {
  try {
    // v3.x API - using available components
    const classifier = components.get(OBC.Classifier);
    if (classifier) {
      try {
        await (classifier as any).classifyBySpatialStructure(model);
      } catch (e) {
        console.log("Spatial structure classification not available:", e);
      }
      try {
        (classifier as any).classifyByEntity(model);
      } catch (e) {
        console.log("Entity classification not available:", e);
      }
    }
  } catch (e) {
    console.log("Processing error:", e);
  }
}

async function showProperties() {
  if (!fragmentModel) return;
  try {
    const highlighter = highlighterComponent;
    const selection = (highlighter.selection as any).select;
    if (!selection || Object.keys(selection).length === 0) return;

    for (const fragmentID in selection) {
      const expressIDs = selection[fragmentID];
      for (const id of expressIDs) {
        const prop = await fragmentModel.getProperties(id);
        console.log(prop);
      }
    }
  } catch (e) {
    console.error("Show properties error:", e);
  }
}

function toggleVisibility() {
  try {
    const highlighter = highlighterComponent;
    const selection = (highlighter.selection as any).select;
    if (!selection || Object.keys(selection).length === 0) return;

    const hider = components.get(OBC.Hider);
    const fragmentsManager = components.get(OBC.FragmentsManager);

    for (const fragmentID in selection) {
      const fragment = (fragmentsManager as any).groups.get(fragmentID);
      const expressIDs = selection[fragmentID];
      for (const id of expressIDs) {
        if (!fragment) continue;
        const isVisible = !(fragment as any).hiddenItems.has(id);
        (fragment as any).setVisibility(!isVisible, [id]);
      }
    }
  } catch (e) {
    console.error("Toggle visibility error:", e);
  }
}

function isolateSelection() {
  try {
    const highlighter = highlighterComponent;
    const hider = components.get(OBC.Hider);
    const selection = (highlighter.selection as any).select;
    hider.isolate(selection);
  } catch (e) {
    console.error("Isolate error:", e);
  }
}

function showAll() {
  try {
    const hider = components.get(OBC.Hider);
    hider.set(true);
  } catch (e) {
    console.error("Show all error:", e);
  }
}

function classifier() {
  if (!floatingGrid) return;
  try {
    const layout = (floatingGrid as any).layout;
    if (layout !== "classifier") {
      (floatingGrid as any).layout = "classifier";
    } else {
      (floatingGrid as any).layout = "main";
    }
  } catch (e) {
    console.error("Classifier error:", e);
  }
}

function worldUpdate() {
  if (!floatingGrid) return;
  try {
    (floatingGrid as any).layout = "world";
  } catch (e) {
    console.error("World update error:", e);
  }
}

let fragmentModel: any;
const container = document.getElementById("viewer-container")!;
const components = new OBC.Components();
const worlds = components.get(OBC.Worlds);

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

const grids = components.get(OBC.Grids);
grids.create(world);

const fragmentsManager = components.get(OBC.FragmentsManager);
const fragmentIfcLoader = components.get(OBC.IfcLoader);

await fragmentIfcLoader.setup();

fragmentsManager.onFragmentsLoaded.add(async (model) => {
  world.scene.three.add(model);
  if (model.hasProperties) {
    await processModel(model);
  }
  fragmentModel = model;
});

const highlighterComponent = components.get(OBCF.Highlighter);
highlighterComponent.setup({ world });
highlighterComponent.zoomToSelection = true;

container.addEventListener("resize", () => {
  world.renderer?.resize();
  world.camera.updateAspect();
});

fragmentIfcLoader.settings.webIfc.COORDINATE_TO_ORIGIN = true;

BUI.Manager.init();

const floatingGrid = BUI.Component.create<BUI.Grid>(() => {
  return BUI.html`
      <bim-grid
          floating
          style="padding: 20px"
      ></bim-grid>
  `;
});

const toolbar = BUI.Component.create<BUI.Toolbar>(() => {
  const [loadIfcBtn] = CUI.buttons.loadIfc({ components });

  return BUI.html`
    <bim-toolbar style="justify-self: center;">
      <bim-toolbar-section label="Import">
        ${loadIfcBtn}
      </bim-toolbar-section>
      <bim-toolbar-section label="Fragments">
        <bim-button tooltip-title="Import" icon="mdi:cube" @click=${importFragments}></bim-button>
        <bim-button tooltip-title="Export" icon="tabler:package-export" @click=${exportFragments}></bim-button>
        <bim-button tooltip-title="Dispose" icon="tabler:trash" @click=${disposeFragments}></bim-button>
      </bim-toolbar-section>
      <bim-button tooltip-title="Visibility" icon="mdi:eye" @click=${toggleVisibility}></bim-button>
      <bim-button tooltip-title="Isolate" icon="mdi:filter" @click=${isolateSelection}></bim-button>
      <bim-button tooltip-title="Show all" icon="tabler:eye-filled" @click=${showAll}></bim-button>
      <bim-toolbar-section label="Properties">
        <bim-button tooltip-title="Show" icon="clarity:list-line" @click=${showProperties}></bim-button>
      </bim-toolbar-section>
      <bim-toolbar-section label="Groups">
        <bim-button tooltip-title="Classifier" icon="tabler:eye-filled" @click=${classifier}></bim-button>
      </bim-toolbar-section>
      <bim-toolbar-section label="App">
        <bim-button tooltip-title="World" icon="tabler:brush" @click=${worldUpdate}></bim-button>
      </bim-toolbar-section>
    </bim-toolbar>
  `;
});

(floatingGrid as any).layouts = {
  main: {
    template: `
          "empty" 1fr
          "toolbar" auto
          /1fr
      `,
    elements: {
      toolbar,
    },
  },
};

(floatingGrid as any).layout = "main";
container.appendChild(floatingGrid);
