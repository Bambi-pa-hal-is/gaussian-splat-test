import React, { useEffect, useState } from 'react';
import { useThree } from '@react-three/fiber';
import { Viewer } from 'gle-gs3d';

interface SplatRendererProps {
  splatFile: string; // Path to your .ply or .splat file
}

const SplatRenderer: React.FC<SplatRendererProps> = ({ splatFile }) => {
  const { gl, scene, camera } = useThree();
  const [viewer, setViewer] = useState<Viewer | null>(null);

  useEffect(() => {
    // Ensure the viewer is only initialized once and when the necessary components are available
    if (!gl || viewer) return;

    const newViewer = new Viewer({
      selfDrivenMode: false,
      renderer: gl,
      camera: camera,
      useBuiltInControls: false,
    });

    newViewer.init();
    newViewer.loadFile(splatFile)
      .then(() => {
        // If there are any actions to be taken after the file is successfully loaded
      })
      .catch((error) => console.error("Failed to load splat file:", error));

    setViewer(newViewer);

    return () => {
      // Cleanup and dispose resources when the component unmounts
    };
  }, []); // Dependencies to trigger re-initialization

  return null; // This component does not render anything itself
};

export default SplatRenderer;
