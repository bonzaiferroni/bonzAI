import {Agent} from "./Agent";
import {Mission} from "../missions/Mission";
import {RaidGuru} from "../missions/RaidGuru";
import {helper} from "../../helpers/helper";
import {AbstractAgent} from "./AbstractAgent";
export class RaidAgent extends Agent {

    public posLastTick: RoomPosition;

    constructor(creep: Creep, mission: Mission) {
        super(creep, mission);
        this.trackMovement();
    }
}

