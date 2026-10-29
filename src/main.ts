import './style.css';
import { createSmokeScene } from './presentation/smokeScene';

const canvas = document.querySelector<HTMLCanvasElement>('#game');
if (!canvas) {
  throw new Error('Missing #game canvas');
}

createSmokeScene(canvas);
