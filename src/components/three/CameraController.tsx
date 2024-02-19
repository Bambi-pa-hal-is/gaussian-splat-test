import React, { useRef, useEffect } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const CameraController = () => {
  const { camera, gl } = useThree();
  const moveForward = useRef(false);
  const moveBackward = useRef(false);
  const moveLeft = useRef(false);
  const moveRight = useRef(false);
  
  const euler = new THREE.Euler(0, 0, 0, 'YXZ');
  const PI_2 = Math.PI / 2;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      switch (event.code) {
        case 'ArrowUp':
        case 'KeyW': moveForward.current = true; break;
        case 'ArrowLeft':
        case 'KeyA': moveLeft.current = true; break;
        case 'ArrowDown':
        case 'KeyS': moveBackward.current = true; break;
        case 'ArrowRight':
        case 'KeyD': moveRight.current = true; break;
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      switch (event.code) {
        case 'ArrowUp':
        case 'KeyW': moveForward.current = false; break;
        case 'ArrowLeft':
        case 'KeyA': moveLeft.current = false; break;
        case 'ArrowDown':
        case 'KeyS': moveBackward.current = false; break;
        case 'ArrowRight':
        case 'KeyD': moveRight.current = false; break;
      }
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);

    const handleMouseMove = (event: MouseEvent) => {
      if (document.pointerLockElement === gl.domElement) {
        const { movementX, movementY } = event;
        
        euler.setFromQuaternion(camera.quaternion);

        euler.y -= movementX * 0.002;
        euler.x -= movementY * 0.002;
        
        euler.x = Math.max(-PI_2, Math.min(PI_2, euler.x));

        camera.quaternion.setFromEuler(euler);
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    gl.domElement.addEventListener('click', () => gl.domElement.requestPointerLock());

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
      document.removeEventListener('mousemove', handleMouseMove);
    };
  }, [camera, gl.domElement]);

  useFrame((state, delta) => {
    const speed = 5; // Adjust this value to control the overall speed of the movement
    const direction = new THREE.Vector3();
  
    if (moveForward.current) direction.z -= 1;
    if (moveBackward.current) direction.z += 1;
    if (moveLeft.current) direction.x -= 1;
    if (moveRight.current) direction.x += 1;
  
    direction.normalize().multiplyScalar(speed * delta);
  
    // Convert camera quaternion to Euler angles
    const euler = new THREE.Euler(0, 0, 0, 'YXZ');
    euler.setFromQuaternion(camera.quaternion);
  
    // Reset pitch and roll (keep yaw)
    euler.x = 0;
    euler.z = 0;
  
    // Convert back to quaternion
    const yawQuaternion = new THREE.Quaternion();
    yawQuaternion.setFromEuler(euler);
  
    // Apply the quaternion with only yaw to the direction
    direction.applyQuaternion(yawQuaternion);
  
    camera.position.add(direction);
    // Optionally, ensure the camera's Y position is locked to a certain height
    // camera.position.y = fixedYValue; // Set this to your desired Y position
  });


  return null;
};

export default CameraController;
