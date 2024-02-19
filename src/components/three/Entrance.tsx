import { Object3DNode, extend } from '@react-three/fiber';
import { LumaSplatsThree, LumaSplatsSemantics } from "@lumaai/luma-web";

// Make LumaSplatsThree available to R3F
extend( { LumaSplats: LumaSplatsThree } );

// For typeScript support:
declare module '@react-three/fiber' {
  interface ThreeElements {
    lumaSplats: Object3DNode<LumaSplatsThree, typeof LumaSplatsThree>
  }
}

export function Entrance() {
	return <lumaSplats
		semanticsMask={LumaSplatsSemantics.ALL}
		source='https://lumalabs.ai/capture/6a0d5c7f-08cd-4316-9ffc-d699e9baf7eb'
        // source='http://localhost:3000/polycam.ply'
        rotation={[0,1.0,0]}
		position={[1, 0, -5]}
		scale={1}
	/>
}