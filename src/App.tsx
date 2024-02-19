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
    <Canvas style={{width:"100vw", height:"100vh"}} >
      {/* <CameraControls ref={cameraControlRef} /> */}
      {/* <FirstPersonCameraController /> */}
      <CameraController/>
      <ambientLight />
      <pointLight position={[10, 10, 10]} />
      <Apartment />
      <Entrance />
    </Canvas>
  );
}

export default App;
