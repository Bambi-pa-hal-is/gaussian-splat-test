import './App.css';
import { Canvas } from '@react-three/fiber';
import { Box } from './components/three/Box';
import { Apartment } from './components/three/Appertment';
import { CameraControls } from '@react-three/drei';
import { useRef } from 'react';
import FirstPersonCameraController from './components/three/FirstPersonCameraController';
import CameraController from './components/three/CameraController';
import { Entrance } from './components/three/Entrance';

function App() {
  const cameraControlRef = useRef<CameraControls | null>(null);

  return (
<Canvas
  style={{ width: "100vw", height: "100vh" }}
  dpr={1}
  camera={{ fov: 50, aspect: 1280 / 720, position: [0, 0, 5] }}
  onCreated={({ gl, camera }) => {
    // Fixed internal render resolution
    gl.setSize(1280, 720, false);

    // Type guard for TS + correct runtime behavior
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.aspect = 1280 / 720;
      camera.updateProjectionMatrix();
    }
  }}
>
      {/* <CameraControls ref={cameraControlRef} /> */}
      {/* <FirstPersonCameraController /> */}
      <CameraController/>
      <ambientLight />
      <pointLight position={[10, 10, 10]} />
      <Apartment />
      {/* <Entrance /> */}
    </Canvas>
  );
}

export default App;
