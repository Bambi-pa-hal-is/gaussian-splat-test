import './App.css';
import { Canvas } from '@react-three/fiber';
import { Box } from './components/three/Box';
import { CameraControls } from '@react-three/drei';
import { useRef } from 'react';
import FirstPersonCameraController from './components/three/FirstPersonCameraController';
import CameraController from './components/three/CameraController';
import SplatRenderer from './components/three/SplatRenderer';

function App() {
  const cameraControlRef = useRef<CameraControls | null>(null);

  return (
    <Canvas style={{width:"100vw", height:"100vh"}} >
      {/* <CameraControls ref={cameraControlRef} /> */}
      {/* <FirstPersonCameraController /> */}
      <CameraController/>
      <ambientLight />
      <pointLight position={[10, 10, 10]} />
      <Box/>
      {/* <SplatRenderer splatFile={"./vardagsrum.ply"}  /> */}
    </Canvas>
  );
}

export default App;
