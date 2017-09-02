import {GeologyMission} from "./GeologyMission";
import {Agent} from "../agents/Agent";
export class KeeperGeologyMission extends GeologyMission {
    protected maxStations = 1;

    protected geologistActions(geologist: Agent) {
        let fleeing = geologist.fleeHostiles();
        if (fleeing) { return; } // early

        super.geologistActions(geologist);
    }
}