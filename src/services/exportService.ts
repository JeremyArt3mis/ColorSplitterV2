/**
 * STL Binary Export and JSZip Archiving Service
 */
import * as THREE from 'three';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import JSZip from 'jszip';
import { SplitPart } from '../types';

/**
 * Exports a single SplitPart as a binary STL ArrayBuffer
 */
export function exportPartToBinarySTL(part: SplitPart): ArrayBuffer {
  const exporter = new STLExporter();
  const mesh = new THREE.Mesh(part.geometry, new THREE.MeshBasicMaterial());
  const output = exporter.parse(mesh, { binary: true });
  if (output instanceof DataView) {
    return output.buffer;
  }
  return output as unknown as ArrayBuffer;
}

/**
 * Triggers a browser file download from a Blob
 */
export function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.style.display = 'none';
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 1000);
}

/**
 * Downloads a single part as a binary .stl file
 */
export function downloadSinglePartSTL(part: SplitPart) {
  const buffer = exportPartToBinarySTL(part);
  const blob = new Blob([buffer], { type: 'application/octet-stream' });
  const sanitizedName = part.name.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
  triggerDownload(blob, `${sanitizedName}.stl`);
}

/**
 * Packages all solid bodies into a zip archive with individual binary STLs
 */
export async function downloadAllPartsZip(parts: SplitPart[], baseProjectName: string = 'split_model') {
  const zip = new JSZip();
  const folder = zip.folder('stl_parts') || zip;

  let manifestText = `# Multi-Color 3D Printing Model Parts\n`;
  manifestText += `Exported from Color Splitter (Manifold-3D Watertight CSG)\n`;
  manifestText += `Total Parts: ${parts.length}\n\n`;

  parts.forEach((part, index) => {
    const buffer = exportPartToBinarySTL(part);
    const filename = `${String(index + 1).padStart(2, '0')}_${part.name.toLowerCase().replace(/[^a-z0-9_-]/g, '_')}.stl`;
    folder.file(filename, buffer);

    manifestText += `- ${filename}\n`;
    manifestText += `  Type: ${part.type}\n`;
    manifestText += `  Color: ${part.color}\n`;
    manifestText += `  Volume: ${part.volume.toFixed(2)} mm³\n`;
    manifestText += `  Triangles: ${part.triangleCount}\n\n`;
  });

  zip.file('README.txt', manifestText);

  const zipBlob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  });

  const timestamp = new Date().toISOString().slice(0, 10);
  triggerDownload(zipBlob, `${baseProjectName}_parts_${timestamp}.zip`);
}
