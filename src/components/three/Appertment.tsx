import { Object3DNode, extend } from '@react-three/fiber';
import { LumaSplatsThree, LumaSplatsSemantics, LumaSplatsLoader } from "@lumaai/luma-web";

// Make LumaSplatsThree available to R3F
extend( { LumaSplats: LumaSplatsThree } );

// For typeScript support:
declare module '@react-three/fiber' {
  interface ThreeElements {
    lumaSplats: Object3DNode<LumaSplatsThree, typeof LumaSplatsThree>
  }
}

export function Apartment() {

	// const loader = new LumaSplatsLoader("./vardagsrum.ply");

	return <lumaSplats
		semanticsMask={LumaSplatsSemantics.ALL}
		source='https://lumalabs.ai/capture/edc75955-cc27-4a36-a38b-145c71ca0bb8'
		// source='https://lumalabs.ai/capture/edc75955-cc27-4a36-a38b-145c71ca0bb8'
        // source='http://localhost:3000/polycam.ply'
        rotation={[0,1.0,0]}
		position={[0, 0, 2]}

		scale={1}
	/>
}