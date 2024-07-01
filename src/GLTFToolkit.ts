import {
  type BufferAttribute,
  type Group,
  type InstancedMesh,
  type InterleavedBufferAttribute,
  type Mesh,
  type Object3D,
} from 'three';
import {
  featureIdAttributeNamePrefix,
  MeshFeatures,
  type ExtMeshFeatures,
  type ExtMeshGpuInstancing,
} from './MeshFeatures';
import { type GLTF } from 'three/examples/jsm/Addons.js';

enum ExtensionNames {
  EXT_mesh_features = 'EXT_mesh_features',
  EXT_instance_features = 'EXT_instance_features',
  EXT_mesh_gpu_instancing = 'EXT_mesh_gpu_instancing',
}

export namespace GLTFToolkit {
  /**
   * Parse the mesh features
   * @param glTF - the glTF to be parsed
   * @returns - the parsed glTF
   */
  export async function parseMeshFeatures(glTF: GLTF): Promise<GLTF> {
    if (hasExtMeshFeatures(glTF)) {
      parseExtMeshFeatures(glTF.scene);
    }
    if (hasExtInstanceFeatures(glTF)) {
      await parseExtInstanceFeatures(glTF);
    }
    return glTF;
  }

  export function hasFeatures(glTF: GLTF): boolean {
    return (
      glTF.parser &&
      glTF.parser.json &&
      (hasExtMeshFeatures(glTF) || hasExtInstanceFeatures(glTF))
    );
  }
}

function hasAnyExtensions(glTF: GLTF): boolean {
  return glTF.parser.json.extensionsUsed;
}

function hasExtMeshFeatures(glTF: GLTF): boolean {
  return (
    hasAnyExtensions(glTF) &&
    glTF.parser.json.extensionsUsed.includes(ExtensionNames.EXT_mesh_features)
  );
}

function hasExtInstanceFeatures(glTF: GLTF): boolean {
  return (
    hasAnyExtensions(glTF) &&
    glTF.parser.json.extensionsUsed.includes(
      ExtensionNames.EXT_instance_features,
    )
  );
}

function parseExtMeshFeatures(glTFScene: Object3D, featureIdSetIndex?: number) {
  featureIdSetIndex = featureIdSetIndex ?? 0;
  // parse EXT_mesh_features
  const featuredMeshes: Mesh[] = [];
  glTFScene.traverse((obj) => {
    if (
      !obj.userData.gltfExtensions ||
      !obj.userData.gltfExtensions[ExtensionNames.EXT_mesh_features]
    ) {
      // not a featured mesh
      return;
    }
    if (obj.userData.gltfExtensions[ExtensionNames.EXT_mesh_gpu_instancing]) {
      // if the mesh is instanced, it is not supported
      console.warn('The batched mesh is instanced, which is not supported');
      return;
    }
    if (!(obj as Mesh).isMesh) {
      // if the object is not a mesh, it is not supported
      console.warn('obj is not a mesh');
      return;
    }
    featuredMeshes.push(obj as Mesh);
  });

  // batch the featured meshes
  for (let i = 0; i < featuredMeshes.length; i++) {
    const mesh = featuredMeshes[i];
    // get the meshFeatures of the mesh
    const meshFeatures = mesh.userData.gltfExtensions[
      ExtensionNames.EXT_mesh_features
    ] as ExtMeshFeatures;
    if (!meshFeatures || meshFeatures.featureIds.length === 0) {
      console.warn('meshFeatures is empty');
      continue;
    }
    // get the featureIdSet of the mesh
    const featureIdSet = meshFeatures.featureIds[featureIdSetIndex];
    if (!featureIdSet) {
      console.warn('featureIdSet is undefined');
      continue;
    }
    // batch the mesh
    const batchedMesh = MeshFeatures.generateBatchedFeatureMesh(
      mesh,
      featureIdSet,
    );
    const parent = mesh.parent;
    if (parent) {
      // cannot use batch root obj directly, because it could be a mesh
      parent.remove(mesh);
      parent.add(batchedMesh);
    }
  }
}

async function parseExtInstanceFeatures(
  glTF: GLTF,
  featureIdSetIndex?: number,
): Promise<GLTF> {
  featureIdSetIndex = featureIdSetIndex ?? 0;
  // get all the nodes in the glTF
  const nodes: {
    extensions?: {
      [ExtensionNames.EXT_mesh_features]?: ExtMeshFeatures;
      [ExtensionNames.EXT_instance_features]?: ExtMeshFeatures;
      [ExtensionNames.EXT_mesh_gpu_instancing]?: ExtMeshGpuInstancing;
    };
  }[] = glTF.parser.json.nodes;
  // traverse all the nodes
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (
      !node.extensions ||
      !node.extensions[ExtensionNames.EXT_instance_features] ||
      !node.extensions[ExtensionNames.EXT_mesh_gpu_instancing]
    ) {
      // if the node is not instanced, continue
      continue;
    }
    // check if the node is already has mesh features
    if (node.extensions[ExtensionNames.EXT_mesh_features]) {
      // if the node is already batched, continue
      console.warn(
        'The instanced node contains batched mesh, which is not supported',
      );
      continue;
    }

    // get the meshFeatures of the instancing node
    const meshFeatures = node.extensions[ExtensionNames.EXT_instance_features];
    // check if the featureIds is empty
    if (!meshFeatures.featureIds || meshFeatures.featureIds.length < 1) {
      console.warn('meshFeatures is empty');
      continue;
    }
    // get the featureIdSet of the mesh
    const featureIdSet = meshFeatures.featureIds[featureIdSetIndex];
    if (!featureIdSet) {
      console.warn('featureIdSet is undefined');
      continue;
    }
    // create the index-featureId map
    const indexFeatureIdMap: Float32Array = new Float32Array(
      featureIdSet.featureCount,
    );
    // get the featureIds
    const attributeName =
      `${featureIdAttributeNamePrefix}${featureIdSet.attribute}`.toUpperCase();
    const featureIdAccessorIndex =
      node.extensions[ExtensionNames.EXT_mesh_gpu_instancing].attributes[
        attributeName
      ];
    const bufferAttribute: BufferAttribute | InterleavedBufferAttribute =
      await glTF.parser.loadAccessor(featureIdAccessorIndex);
    // check if the bufferAttribute is empty
    if (!bufferAttribute) {
      console.warn('featureIdAccessor is not defined');
      continue;
    }
    const featureIds = bufferAttribute.array as Float32Array;
    // check if the featureIds is empty
    if (!featureIds) {
      console.warn('featureIds is not defined');
      continue;
    }
    // fill the index-featureId map
    for (let j = 0; j < featureIds.length; j++) {
      indexFeatureIdMap[j] = featureIds[j];
    }
    // get three.js object that the node refers to
    const relatedObject: Group | Mesh = await glTF.parser.getDependency(
      'node',
      i,
    );
    // get all the instanced meshes
    const instancedMeshes: InstancedMesh[] = [];
    relatedObject.traverse((obj) => {
      if (!(obj as InstancedMesh).isInstancedMesh) {
        return;
      }
      instancedMeshes.push(obj as InstancedMesh);
    });
    // batch the instanced meshes
    for (let k = 0; k < instancedMeshes.length; k++) {
      const instancedMesh = instancedMeshes[k];
      const instancedFeatureMesh = MeshFeatures.generateInstancedFeatureMesh(
        instancedMesh,
        indexFeatureIdMap,
      );
      const parent = instancedMesh.parent;
      if (parent) {
        // cannot use instanced root obj directly, because it could be a mesh
        parent.remove(instancedMesh);
        parent.add(instancedFeatureMesh);
      }
    }
  }
  return glTF;
}
