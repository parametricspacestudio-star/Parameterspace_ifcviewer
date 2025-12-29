import * as BUI from "@thatopen/ui";
import * as OBC from "@thatopen/components";
import * as OBCF from "@thatopen/components-front";
import * as CUI from "@thatopen/ui-obc";
import { FragmentsGroup } from "@thatopen/fragments";
import * as THREE from "three";

async function exportFragments() {
  const fragmentsManager = components.get(OBC.FragmentsManager);
  if (!fragmentModel) {
    return;
  }

  const fragmentBinary = fragmentsManager.export(fragmentModel);
  const blob = new Blob([fragmentBinary as any]);
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
    if (!(binary instanceof ArrayBuffer)) {
      return;
    }
    const fragmentBinary = new Uint8Array(binary);
    const fragmentsManager = components.get(OBC.FragmentsManager);
    await fragmentsManager.load(fragmentBinary);
  });

  input.addEventListener("change", () => {
    const filesList = input.files;
    if (!filesList) {
      return;
    }
    reader.readAsArrayBuffer(filesList[0]);
  });

  input.click();
}

function disposeFragments() {
  const fragmentsManager = components.get(OBC.FragmentsManager);
  for (const [, group] of fragmentsManager.groups) {
    fragmentsManager.dispose();
  }
  fragmentModel = undefined;
}

async function processModel(model: FragmentsGroup) {
  const indexer = components.get(OBC.IfcRelationsIndexer);
  await indexer.process(model);

  const classifier = components.get(OBC.Classifier);
  await classifier.bySpatialStructure(model);
  classifier.byEntity(model);

  const classifications = [
    {
      system: "entities",
      label: "Entities",
    },
    {
      system: "spatialStructures",
      label: "Spatial Structures",
    },
  ];

  if (updateClassificationsTree) {
    updateClassificationsTree({ classifications });
  }
}

async function showProperties() {
  if (!fragmentModel) {
    return;
  }
  const highlighter = components.get(OBCF.Highlighter);
  const selection = highlighter.selection.select;
  const indexer = components.get(OBC.IfcRelationsIndexer);
  if (selection.size === 0) {
    return;
  }

  for (const [fragmentID, expressIDs] of (selection as any)) {
    for (const id of (expressIDs as any)) {
      const psets = indexer.getEntityRelations(
        fragmentModel,
        id,
        "IsDefinedBy"
      );
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
  if (selection.size === 0) {
    return;
  }

  for (const [fragmentID, expressIDs] of (selection as any)) {
    for (const id of (expressIDs as any)) {
      const isVisible = (hider as any).get ? (hider as any).get(fragmentID, id) : true;
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
  (hider as any).showAll ? (hider as any).showAll() : hider.set(true);
}

function classifier() {
  if (!floatingGrid) {
    return;
  }
  if (floatingGrid.layout !== "classifier") {
    floatingGrid.layout = "classifier";
  } else {
    floatingGrid.layout = "main";
  }
}

function worldUpdate() {
  if (!floatingGrid) {
    return;
  }
  floatingGrid.layout = "world";
}

let fragmentModel: FragmentsGroup | undefined;
const container = document.getElementById("viewer-container")!;
const components = new OBC.Components();
const worlds = components.get(OBC.Worlds);

const [classificationsTree, updateClassificationsTree] =
  CUI.tables.classificationTree({
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
  const tables = CUI.tables as any;
  const tableFn = tables.propertiesTable || tables.elementProperties;
  const [propsTable, updatePropsTable] = tableFn({
    components,
    fragmentIdMap: {},
  });

  const highlighter = components.get(OBCF.Highlighter);

  highlighter.events.select.onHighlight.add((fragmentIdMap) => {
    if (!floatingGrid) {
      return;
    }
    floatingGrid.layout = "secondary";
    updatePropsTable({ fragmentIdMap });
    propsTable.expanded = false;
  });

  highlighter.events.select.onClear.add(() => {
    updatePropsTable({ fragmentIdMap: {} });
    if (!floatingGrid) {
      return;
    }
    floatingGrid.layout = "main";
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
  const [worldsTable] = (CUI.tables as any).worldsConfiguration ? (CUI.tables as any).worldsConfiguration({ components }) : [BUI.html`<bim-label>Worlds Table Not Found</bim-label>`];

  const search = (e: Event) => {
    const input = e.target as BUI.TextInput;
    if (worldsTable && 'queryString' in worldsTable) {
        worldsTable.queryString = input.value;
    }
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
floatingGrid.layout = "main";

container.appendChild(floatingGrid);