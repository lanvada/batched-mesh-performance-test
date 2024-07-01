import {
  BatchedMesh,
  BufferAttribute,
  BufferGeometry,
  InstancedMesh,
  type InterleavedBufferAttribute,
  type Material,
  type Mesh,
} from 'three';

export interface ExtMeshFeatures {
  featureIds: FeatureIdSet[];
}

export interface ExtMeshGpuInstancing {
  attributes: {
    [key: string]: number;
    TRANSLATION: number;
    ROTATION: number;
    SCALE: number;
  };
}

export interface FeatureIdSet {
  featureCount: number;
  attribute: number;
}

interface FeatureInfo {
  featureId: number;
  vertexSections: {
    /**
     * The start index of the vertex section.
     */
    start: number;
    /**
     * The end index of the vertex section. The end index is exclusive.
     */
    end: number;
  }[];
  indexSections: {
    /**
     * The start index of the index section.
     */
    start: number;
    /**
     * The end index of the index section. The end index is exclusive.
     */
    end: number;
  }[];
}

export const featureIdAttributeNamePrefix = '_feature_id_';

export namespace MeshFeatures {
  /**
   *
   * @param mesh
   * @param featureIdSet
   * @returns
   */
  export function generateBatchedFeatureMesh(
    mesh: Mesh,
    featureIdSet: FeatureIdSet,
  ): BatchedMesh {
    const geometry = mesh.geometry;
    const material = mesh.material as Material;
    const featureIdAttribute = geometry.getAttribute(
      `${featureIdAttributeNamePrefix}${featureIdSet.attribute}`,
    );
    let featureInfos = countVertices(featureIdAttribute);
    featureInfos = countIndices(
      geometry.index!,
      featureIdAttribute,
      featureInfos,
    );
    if (featureInfos.size === 0) {
      throw new Error('featureInfos is empty');
    }
    if (featureInfos.size !== featureIdSet.featureCount) {
      throw new Error('featureInfos size is not equal to featureCount');
    }
    const batchedFeatureMesh = createBatchedMesh(
      Array.from(featureInfos.values()),
      geometry,
      material,
    );
    // set object3D properties
    batchedFeatureMesh.name = mesh.name;
    batchedFeatureMesh.position.copy(mesh.position);
    batchedFeatureMesh.rotation.copy(mesh.rotation);
    batchedFeatureMesh.scale.copy(mesh.scale);
    batchedFeatureMesh.userData = mesh.userData;
    // set mesh properties
    batchedFeatureMesh.morphTargetInfluences = mesh.morphTargetInfluences;
    batchedFeatureMesh.morphTargetDictionary = mesh.morphTargetDictionary;
    //
    return batchedFeatureMesh;
  }

  /**
   *
   * @param instancedMesh
   * @param indexFeatureIdMap
   * @returns
   */
  export function generateInstancedFeatureMesh(
    instancedMesh: InstancedMesh,
    indexFeatureIdMap: Float32Array,
  ): InstancedMesh {
    const instancedFeatureMesh = new InstancedMesh(
      instancedMesh.geometry,
      instancedMesh.material as Material,
      instancedMesh.count,
    );
    // instanced mesh properties
    instancedFeatureMesh.instanceMatrix.copy(instancedMesh.instanceMatrix);
    instancedFeatureMesh.instanceMatrix.needsUpdate = true;
    //
    instancedFeatureMesh.instanceColor = instancedMesh.instanceColor;
    if (instancedFeatureMesh.instanceColor) {
      instancedFeatureMesh.instanceColor.needsUpdate = true;
    }
    //
    instancedFeatureMesh.morphTexture = instancedMesh.morphTexture;
    instancedFeatureMesh.boundingBox = instancedMesh.boundingBox;
    instancedFeatureMesh.boundingSphere = instancedMesh.boundingSphere;
    // mesh properties
    instancedFeatureMesh.morphTargetInfluences =
      instancedMesh.morphTargetInfluences;
    instancedFeatureMesh.morphTargetDictionary =
      instancedMesh.morphTargetDictionary;
    // object3D properties
    instancedFeatureMesh.name = instancedMesh.name;
    instancedFeatureMesh.position.copy(instancedMesh.position);
    instancedFeatureMesh.rotation.copy(instancedMesh.rotation);
    instancedFeatureMesh.scale.copy(instancedMesh.scale);
    instancedFeatureMesh.userData = instancedMesh.userData;

     // @ts-ignore - indexFeatureIdMap is a Float32Array
    instancedFeatureMesh._indexFeatureIdMap = new Float32Array(instancedMesh.count);
    // @ts-ignore - _featureIdIndexMap is a Map<number, number>
    instancedFeatureMesh._featureIdIndexMap = new Map<number, number>();
    // set the index-featureId map
    for (let i = 0; i < indexFeatureIdMap.length; i++) {
      // @ts-ignore - indexFeatureIdMap is a Float32Array
      instancedFeatureMesh._indexFeatureIdMap[i] = indexFeatureIdMap[i];
      // @ts-ignore - _featureIdIndexMap is a Map<number, number>
      instancedFeatureMesh._featureIdIndexMap.set(indexFeatureIdMap[i], i);
    }
    //
    return instancedFeatureMesh;
  }
}

function countVertices(
  featureIdAttribute: BufferAttribute | InterleavedBufferAttribute,
): Map<number, FeatureInfo> {
  // check if the featureIdAttr is a Float32Array
  const featureIds = featureIdAttribute.array as Float32Array;
  if (featureIds.length === 0) {
    throw new Error('featureIds is empty');
  }
  // count the vertices
  const featureInfos: Map<number, FeatureInfo> = new Map();
  // calculate how many batches
  let currentSectionVertexCount = 0;
  let lastFeatureId = featureIds[0];
  for (let j = 0; j < featureIds.length; j++) {
    const featureId = featureIds[j];
    if (featureId !== lastFeatureId) {
      // create section to store the vertex count
      const vertexSection = {
        start: j - currentSectionVertexCount,
        end: j,
      };
      // add the vertex section to the batch
      let featureInfo = featureInfos.get(lastFeatureId);
      if (!featureInfo) {
        featureInfo = {
          featureId: lastFeatureId,
          vertexSections: [],
          indexSections: [],
        };
        featureInfos.set(lastFeatureId, featureInfo);
      }
      featureInfo.vertexSections.push(vertexSection);
      // set the vertexCount to 0
      currentSectionVertexCount = 0;
      lastFeatureId = featureId;
    }
    currentSectionVertexCount++;
  }
  // add the last batch
  const vertexSection = {
    start: featureIds.length - currentSectionVertexCount,
    end: featureIds.length,
  };
  let featureInfo = featureInfos.get(lastFeatureId);
  if (!featureInfo) {
    featureInfo = {
      featureId: lastFeatureId,
      vertexSections: [],
      indexSections: [],
    };
    featureInfos.set(lastFeatureId, featureInfo);
  }
  featureInfo.vertexSections.push(vertexSection);
  return featureInfos;
}

function countIndices(
  indexAttribute: BufferAttribute,
  featureAttribute: BufferAttribute | InterleavedBufferAttribute,
  featureInfos: Map<number, FeatureInfo>,
): Map<number, FeatureInfo> {
  // check if the indexAttr is a Int32Array
  const indexArray = indexAttribute.array as Int32Array;
  if (indexArray.length === 0) {
    throw new Error('indexArray is empty');
  }
  // check if the featureAttr is a Float32Array
  const featureIds = featureAttribute.array as Float32Array;
  if (featureIds.length === 0) {
    throw new Error('featureIds is empty');
  }

  // calculate how many indices in each batch
  let lastFeatureId = featureIds[indexArray[0]];
  let currentSectionIndexCount = 3;
  for (let j = 3; j < indexArray.length; ) {
    const index = indexArray[j];
    const featureId = featureIds[index];
    if (featureId !== lastFeatureId) {
      // create section to store the index count
      const indexSection = {
        start: j - currentSectionIndexCount,
        end: j,
      };
      // add the index section to the batch
      const featureInfo = featureInfos.get(lastFeatureId)!;
      featureInfo.indexSections.push(indexSection);
      // set the indexCount to 0
      currentSectionIndexCount = 0;
      lastFeatureId = featureId;
    }
    currentSectionIndexCount += 3;
    j += 3;
  }
  // add the last batch
  const indexSection = {
    start: indexArray.length - currentSectionIndexCount,
    end: indexArray.length,
  };
  const featureInfo = featureInfos.get(lastFeatureId)!;
  featureInfo.indexSections.push(indexSection);
  //
  return featureInfos;
}

function createBatchedMesh(
  featureInfos: FeatureInfo[],
  geometry: BufferGeometry,
  material: Material,
): BatchedMesh {
  // get the geometry data
  const positions = geometry.getAttribute('position').array as Float32Array;
  const normals = geometry.getAttribute('normal').array as Float32Array;
  const indices = geometry.index!.array as Int32Array;
  const indicesMap = new Int32Array(indices.length).fill(-1);

  // get the batch count
  const featureCount = featureInfos.length;
  // create a new batched mesh
  const batchedMesh = new BatchedMesh(
    featureCount,
    positions.length / 3,
    indices.length,
    material,
  );
  // add the geometries to the batched mesh
  for (let j = 0; j < featureCount; j++) {
    const featureInfo = featureInfos[j];
    const vertexSections = featureInfo.vertexSections;
    // calculate the vertex count
    const vertexCount = vertexSections.reduce(
      (acc, cur) => acc + cur.end - cur.start,
      0,
    );
    // create position array
    const positionArray = new Float32Array(vertexCount * 3);
    // create normal array
    const normalArray = new Float32Array(vertexCount * 3);
    // calculate the index count
    const indexCount = featureInfo.indexSections.reduce(
      (acc, cur) => acc + cur.end - cur.start,
      0,
    );
    // create index array
    const indexArray = new Int32Array(indexCount);

    // fill the position, normal and index arrays
    const indexSections = featureInfo.indexSections;
    const indexSectionCount = indexSections.length;
    let vPointer = 0;
    let iPointer = 0;
    for (let k = 0; k < indexSectionCount; k++) {
      const { start, end } = indexSections[k];
      for (let m = start; m < end; m++) {
        const index = indices[m];
        let newIndex = indicesMap[index];
        if (newIndex === -1) {
          let n = index * 3;
          // set position and normal
          positionArray[vPointer] = positions[n];
          normalArray[vPointer] = normals[n];
          positionArray[++vPointer] = positions[++n];
          normalArray[vPointer] = normals[n];
          positionArray[++vPointer] = positions[++n];
          normalArray[vPointer] = normals[n];
          // set the new index
          newIndex = ++vPointer / 3 - 1;
          // store the old index and new index
          indicesMap[index] = newIndex;
        }
        // set the index
        indexArray[iPointer++] = newIndex;
      }
    }

    // add the geometry to the batched mesh
    const bufferGeometry = new BufferGeometry();
    bufferGeometry.setAttribute(
      'position',
      new BufferAttribute(positionArray, 3),
    );
    bufferGeometry.setAttribute('normal', new BufferAttribute(normalArray, 3));
    bufferGeometry.setIndex(new BufferAttribute(indexArray, 1));
    const geoIndex = batchedMesh.addGeometry(bufferGeometry);
    batchedMesh.addInstance(geoIndex);
  }
  return batchedMesh;
}
