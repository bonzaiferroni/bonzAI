import {TransportGuru} from "./TransportGuru";
import {GeologyMission} from "./GeologyMission";
export class GeologyGuru extends TransportGuru {

    mineral: Mineral;

    constructor(host: GeologyMission) {
        super(host);
        this.mineral = host.mineral;
    }

    registerMineral() {
        if (!Game.cache[this.mineral.mineralType]) Game.cache[this.mineral.mineralType] = 0;
        Game.cache[this.mineral.mineralType]++;
    }
}