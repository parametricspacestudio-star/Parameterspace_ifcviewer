import * as BUI from "@thatopen/ui";
import * as OBC from "@thatopen/components";
import * as OBCF from "@thatopen/components-front";
import * as CUI from "@thatopen/ui-obc";
import * as FRAGS from "@thatopen/fragments";
import * as THREE from "three";

/**
 * BIM 3D Viewer using That Open v3.x
 * Corrected to use official v3.x APIs and types.
 */

async function exportFragments() {
  if (!fragmentModel) return;
  const fragments = components.get(OBC.FragmentsManager);
  // In v3, export is on the FragmentsGroup itself
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
    // In v3, we use FragmentsLoader to load fragments
    const loader = new FRAGS.FragmentsLoader(components);
    await loader.load(fragmentBinary);
  });

  input.addEventListener("change", () => {
    const filesList = input.files;
    if (!filesList) return;
    reader.readAsArrayBuffer(filesList[0]);
  });

  input.click();
}

function disposeFragments() {
  const fragments = components.get(OBC.FragmentsManager);
  // In v3, fragments.groups is a Map
  for (const [, group] of fragments.groups) {
    group.dispose();
  }
  fragmentModel = undefined;
}

async function processModel(model: FRAGS.FragmentsGroup) {
  const indexer = components.get(OBC.IfcRelationsIndexer);
  await indexer.index(model);

  const classifier = components.get(OBC.Classifier);
  await classifier.classify(model); 

  const classifications = [
    {
      system: "entities",
      label: "Entities",
    },
    {
      system: "spatial",
      label: "Spatial Structures",
    },
  ];

  if (updateClassificationsTree) {
    updateClassificationsTree({ classifications });
  }
}

async function showProperties() {
  if (!fragmentModel) return;
  const highlighter = components.get(OBCF.Highlighter);
  const selection = highlighter.selection.select;
  const indexer = components.get(OBC.IfcRelationsIndexer);
  
  if (selection.size === 0) return;

  for (const [fragmentID, expressIDs] of selection) {
    for (const id of expressIDs) {
      const relations = indexer.getEntityRelations(fragmentModel, id, "IsDefinedBy");
      if (relations) {
        for (const expressId of relations) {
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
  if (selection.size === 0) return;

  for (const [fragmentID, expressIDs] of selection) {
    for (const id of expressIDs) {
      const isVisible = hider.get(fragmentID, id);
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
  if (floatingGrid.layout !== "classifier") {
    floatingGrid.layout = "classifier" as any;
  } else {
    floatingGrid.layout = "main" as any;
  }
}

function worldUpdate() {
  if (!floatingGrid) return;
  floatingGrid.layout = "world" as any;
}

let fragmentModel: FRAGS.FragmentsGroup | undefined;
const container = document.getElementById("viewer-container")!;
const components = new OBC.Components();
const worlds = components.get(OBC.Worlds);

// Correct classification tree creation in v3
const [classificationsTree, updateClassificationsTree] = CUI.tables.spatialTreeTemplate({
  components,
  classifications: [],
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

const grids = components.get(OBC.Grids);
grids.create(world);

const fragments = components.get(OBC.FragmentsManager);
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

BUI.Manager.init();

const floatingGrid = BUI.Component.create<BUI.Grid>(() => {
  return BUI.html`
      <bim-grid
          floating
          style="padding: 20px"
      ></bim-grid>
  `;
});

const elementPropertyPanel = BUI.Component.create<BUI.Panel>(() => {
  const [propsTable, updatePropsTable] = CUI.tables.elementProperties({
    components,
    fragmentIdMap: {},
  });

  const highlighter = components.get(OBCF.Highlighter);

  highlighter.events.select.onHighlight.add((fragmentIdMap) => {
    if (!floatingGrid) return;
    floatingGrid.layout = "secondary" as any;
    updatePropsTable({ fragmentIdMap });
    propsTable.expanded = false;
  });

  highlighter.events.select.onClear.add(() => {
    updatePropsTable({ fragmentIdMap: {} });
    if (!floatingGrid) return;
    floatingGrid.layout = "main" as any;
  });

  const search = (e: Event) => {
    const input = e.target as BUI.TextInput;
    propsTable.queryString = input.value;
  };

  return BUI.html`
      <bim-panel>
          <bim-panel-section name="property" label="Property Information" icon="solar:document-bold" fixed>
              <bim-text-input @input=${search} placeholder="Search..."></bim-text-input>
              ${propsTable}
          </bim-panel-section>
      </bim-panel>
  `;
});

const classifierPanel = BUI.Component.create<BUI.Panel>(() => {
  return BUI.html`
      <bim-panel style="width: 400px;">
          <bim-panel-section name="classifier" label="Classifier" icon="solar:document-bold" fixed>
              <bim-label>Classifications</bim-label>
              ${classificationsTree}
          </bim-panel-section>
      </bim-panel>
  `;
});

const worldPanel = BUI.Component.create<BUI.Panel>(() => {
  const [worldsTable] = CUI.tables.worldsConfiguration({ components });

  const search = (e: Event) => {
    const input = e.target as BUI.TextInput;
    worldsTable.queryString = input.value;
  };

  return BUI.html`
      <bim-panel>
          <bim-panel-section name="world" label="World Information" icon="solar:document-bold" fixed>
              <bim-text-input @input=${search} placeholder="Search..."></bim-text-input>
              ${worldsTable}
          </bim-panel-section>
      </bim-panel>
  `;
});

const toolbar = BUI.Component.create<BUI.Toolbar>(() => {
  const [loadIfcBtn] = CUI.buttons.loadIfc({ components: components });

  loadIfcBtn.tooltipTitle = "Load IFC";
  loadIfcBtn.label = "";

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

floatingGrid.layouts = {
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
  secondary: {
    template: `
        "empty elementPropertyPanel" 1fr
        "toolbar toolbar" auto
        /1fr 20rem
    `,
    elements: {
      toolbar,
      elementPropertyPanel,
    },
  },
  world: {
    template: `
        "empty worldPanel" 1fr
        "toolbar toolbar" auto
        /1fr 20rem
    `,
    elements: {
      toolbar,
      worldPanel,
    },
  },
  classifier: {
    template: `
        "empty classifierPanel" 1fr
        "toolbar toolbar" auto
        /1fr 20rem
    `,
    elements: {
      toolbar,
      classifierPanel,
    },
  },
};
floatingGrid.layout = "main" as any;

container.appendChild(floatingGrid);
