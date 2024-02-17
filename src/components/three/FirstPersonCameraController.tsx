// FirstPersonCameraController.tsx
import React, { useRef, useEffect, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3 } from 'three';

type Rectangle = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

const moveSpeed = 0.1;
const rectangles: Rectangle[] = [
  { minX: -5, maxX: 5, minY: -5, maxY: 5 }, // Example rectangle
  // Add more rectangles as needed
];

const FirstPersonCameraController: React.FC = () => {
  const { camera } = useThree();
  const moveForward = useRef(false);
  const moveBackward = useRef(false);
  const moveLeft = useRef(false);
  const moveRight = useRef(false);

  const updatePosition = (direction: Vector3) => {
    const canMove = rectangles.some(rect => {
      const newPos = camera.position.clone().add(direction);
      return newPos.x >= rect.minX && newPos.x <= rect.maxX && newPos.z >= rect.minY && newPos.z <= rect.maxY;
    });

    if (canMove) {
      camera.position.add(direction);
    }
  };

  useFrame(() => {
    const direction = new Vector3();
    camera.getWorldDirection(direction);
    direction.y = 0; // Keep the movement horizontal

    if (moveForward.current) {
      updatePosition(direction.multiplyScalar(moveSpeed));
    }
    if (moveBackward.current) {
      updatePosition(direction.multiplyScalar(-moveSpeed));
    }

    const sideDirection = new Vector3().crossVectors(camera.up, direction).normalize();
    if (moveLeft.current) {
      updatePosition(sideDirection.multiplyScalar(moveSpeed));
    }
    if (moveRight.current) {
      updatePosition(sideDirection.multiplyScalar(-moveSpeed));
    }
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      switch (event.key) {
        case 'w':
        case 'ArrowUp':
          moveForward.current = true;
          break;
        case 'a':
        case 'ArrowLeft':
          moveLeft.current = true;
          break;
        case 's':
        case 'ArrowDown':
          moveBackward.current = true;
          break;
        case 'd':
        case 'ArrowRight':
          moveRight.current = true;
          break;
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      switch (event.key) {
        case 'w':
        case 'ArrowUp':
          moveForward.current = false;
          break;
        case 'a':
        case 'ArrowLeft':
          moveLeft.current = false;
          break;
        case 's':
        case 'ArrowDown':
          moveBackward.current = false;
          break;
        case 'd':
        case 'ArrowRight':
          moveRight.current = false;
          break;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  return null; // This component doesn't render anything itself
};

export default FirstPersonCameraController;
