import { getMetronomeController } from './controller';
import { Metronome } from './Metronome';
import { installMiniControl } from './MiniControl';

installMiniControl(getMetronomeController());

export function View() {
  return <Metronome />;
}
