import {RaidAgent} from "./RaidAgent";
import {ZombieMission} from "./ZombieMission";
import {notifier} from "../../notifier";
export class ZombieAgent extends RaidAgent {

    memory: {
        reachedFallback: boolean;
        registered: boolean;
        safeCount: number;
        demolishing: boolean;
    };


}