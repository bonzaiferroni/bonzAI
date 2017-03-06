import {Agent} from "./Agent";
import {Mission} from "./Mission";
import {RaidGuru} from "./RaidGuru";
export class RaidAgent extends Agent {

    private guru: RaidGuru;

    constructor(creep: Creep, mission: Mission, guru: RaidGuru) {
        super(creep, mission);
        this.guru = guru;
    }
}
