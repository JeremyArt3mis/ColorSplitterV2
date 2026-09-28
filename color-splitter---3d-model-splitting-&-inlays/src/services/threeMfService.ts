/**
 * 3MF (3D Manufacturing Format) Multi-Color Mesh Parser
 * Extracts objects, triangle groups, materials, and colors from .3mf zip archives.
 */
import * as THREE from 'three';
import JSZip from 'jszip';

export interface Parsed3MFPart {
  name: string;
  geometry: THREE.BufferGeometry;
  color: string;
}

export interface Parsed3MFResult {
  parts: Parsed3MFPart[];
  unit: string;
}

/**
 * Parses a hex color string into standard #RRGGBB
 */
function normalizeColor(colorStr: string | null | undefined, fallback: string = '#38bdf8'): string {
  if (!colorStr) return fallback;
  let clean = colorStr.trim();
  if (!clean.startsWith('#')) clean = '#' + clean;
  // If #AARRGGBB or #RRGGBBAA (8 hex chars), take the RGB part
  if (clean.length === 9) {
    // 3MF spec: #RRGGBBAA or #AARRGGBB. Usually #RRGGBB + AA
    return clean.slice(0, 7);
  }
  if (clean.length === 7) return clean;
  return fallback;
}

/**
 * Parses binary ArrayBuffer of a .3mf file and extracts all precolored solid bodies
 */
export async function parse3MF(arrayBuffer: ArrayBuffer): Promise<Parsed3MFResult> {
  const zip = await JSZip.loadAsync(arrayBuffer);

  // Find the primary model XML file
  let modelFile = zip.file('3D/3dmodel.model');
  if (!modelFile) {
    // Fallback: look for any .model file in the archive
    const found = zip.file(/\.model$/i);
    if (found.length > 0) {
      modelFile = found[0];
    }
  }

  if (!modelFile) {
    throw new Error('Invalid 3MF archive: 3D/3dmodel.model not found');
  }

  const xmlText = await modelFile.async('text');
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlText, 'text/xml');

  // Check for parse errors
  const parseError = xmlDoc.querySelector('parsererror');
  if (parseError) {
    throw new Error('Failed to parse 3MF XML content');
  }

  // 1. Build Color and Material Palette Table
  // 3MF maps property ids (pid) and indices (p1) to colors
  const colorMap = new Map<string, string>(); // key: `pid:index` or `pid`
  const defaultColors: string[] = [
    '#f97316', '#06b6d4', '#ef4444', '#10b981', '#eab308', '#8b5cf6', '#3b82f6', '#ec4899'
  ];

  // A. <m:colorgroup id="..."> <m:color color="#RRGGBB" /> ... </m:colorgroup>
  const colorGroups = xmlDoc.querySelectorAll('colorgroup, \\*|colorgroup');
  colorGroups.forEach((cg) => {
    const cgId = cg.getAttribute('id') || '1';
    const colors = cg.querySelectorAll('color, \\*|color');
    colors.forEach((cEl, idx) => {
      const cVal = cEl.getAttribute('color');
      if (cVal) {
        colorMap.set(`${cgId}:${idx}`, normalizeColor(cVal));
        colorMap.set(`${cgId}`, normalizeColor(cVal));
      }
    });
  });

  // B. <basematerials id="..."> <base name="..." displaycolor="#RRGGBB" /> ... </basematerials>
  const baseMats = xmlDoc.querySelectorAll('basematerials, \\*|basematerials');
  baseMats.forEach((bm) => {
    const bmId = bm.getAttribute('id') || '1';
    const bases = bm.querySelectorAll('base, \\*|base');
    bases.forEach((bEl, idx) => {
      const cVal = bEl.getAttribute('displaycolor') || bEl.getAttribute('color');
      if (cVal) {
        colorMap.set(`${bmId}:${idx}`, normalizeColor(cVal));
        colorMap.set(`${bmId}`, normalizeColor(cVal));
      }
    });
  });

  // C. Top-level <color id="..." color="..." />
  const standaloneColors = xmlDoc.querySelectorAll('resources > color, resources > \\*|color');
  standaloneColors.forEach((sc) => {
    const sId = sc.getAttribute('id');
    const sVal = sc.getAttribute('color');
    if (sId && sVal) {
      colorMap.set(sId, normalizeColor(sVal));
    }
  });

  // 2. Parse Objects and Meshes
  const objects = xmlDoc.querySelectorAll('object');
  const parsedParts: Parsed3MFPart[] = [];
  let partCounter = 0;

  objects.forEach((obj) => {
    const objId = obj.getAttribute('id') || `${partCounter + 1}`;
    const objName = obj.getAttribute('name') || `Part ${partCounter + 1}`;
    const objPid = obj.getAttribute('pid');
    const objP1 = obj.getAttribute('p1');
    const objDefaultColor = (objPid && objP1 && colorMap.get(`${objPid}:${objP1}`)) ||
      (objPid && colorMap.get(objPid)) ||
      defaultColors[partCounter % defaultColors.length];

    const verticesEl = obj.querySelector('vertices');
    const trianglesEl = obj.querySelector('triangles');
    if (!verticesEl || !trianglesEl) return;

    // Read all vertex coordinates
    const vList: [number, number, number][] = [];
    const vNodes = verticesEl.querySelectorAll('vertex');
    vNodes.forEach((v) => {
      vList.push([
        parseFloat(v.getAttribute('x') || '0'),
        parseFloat(v.getAttribute('y') || '0'),
        parseFloat(v.getAttribute('z') || '0')
      ]);
    });

    if (vList.length === 0) return;

    // Group triangles by color / property
    // key: colorHex -> array of vertex positions
    const trianglesByColor = new Map<string, number[]>();
    const tNodes = trianglesEl.querySelectorAll('triangle');

    tNodes.forEach((t) => {
      const v1 = parseInt(t.getAttribute('v1') || '0', 10);
      const v2 = parseInt(t.getAttribute('v2') || '0', 10);
      const v3 = parseInt(t.getAttribute('v3') || '0', 10);

      // Determine triangle color
      const tPid = t.getAttribute('pid') || objPid;
      const tP1 = t.getAttribute('p1') || objP1;
      let triColor = objDefaultColor;

      if (tPid && tP1 && colorMap.has(`${tPid}:${tP1}`)) {
        triColor = colorMap.get(`${tPid}:${tP1}`)!;
      } else if (tPid && colorMap.has(tPid)) {
        triColor = colorMap.get(tPid)!;
      }

      if (v1 < vList.length && v2 < vList.length && v3 < vList.length) {
        let triArr = trianglesByColor.get(triColor);
        if (!triArr) {
          triArr = [];
          trianglesByColor.set(triColor, triArr);
        }
        // Push 3 vertices (9 coordinates)
        triArr.push(
          vList[v1][0], vList[v1][1], vList[v1][2],
          vList[v2][0], vList[v2][1], vList[v2][2],
          vList[v3][0], vList[v3][1], vList[v3][2]
        );
      }
    });

    // Create a Three.js BufferGeometry for each colored group
    trianglesByColor.forEach((positions, color) => {
      if (positions.length < 9) return;
      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
      geom.computeVertexNormals();

      const suffix = trianglesByColor.size > 1 ? ` (${color})` : '';
      parsedParts.push({
        name: `${objName}${suffix}`,
        geometry: geom,
        color
      });
      partCounter++;
    });
  });

  return {
    parts: parsedParts,
    unit: xmlDoc.documentElement.getAttribute('unit') || 'millimeter'
  };
}
