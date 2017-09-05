import {PeaceCommander, PeaceOperation} from "../operations/PeaceOperation";
import {CombatMission, CombatMissionMemory} from "./CombatMission";
import {CombatAgent} from "../agents/CombatAgent";
import {HostileAgent} from "../agents/HostileAgent";
import {AgentManifest} from "./EasyMission";

interface PeaceMissionMemory extends CombatMissionMemory {
    nextAttempt: number;
}

export class PeaceMission extends CombatMission {

    protected commander: PeaceCommander;
    protected attackStructures = true;
    public memory: PeaceMissionMemory;

    constructor(operation: PeaceOperation, commander: PeaceCommander) {
        super(operation, "Peace", operation.roomName);
        this.commander = commander;
    }

    protected buildManifest(): AgentManifest {

        this.boost = this.findBoost();

        let manifest: AgentManifest = {};
        manifest["demo"] = {
            agentClass: CombatAgent,
            max: this.demoMax,
            body: this.demoBody,
            actions: this.demoActions,
            options: {
                deathCallback: this.deathDelayCallback,
            },
        };
        manifest["healer"] = {
            agentClass: CombatAgent,
            max: this.healerMax,
            body: this.healBody,
            actions: this.healerActions,
            options: {
                deathCallback: this.deathDelayCallback,
            },
        };
        if (this.boost) {
            manifest["peace"].options.boosts = [RESOURCE_CATALYZED_ZYNTHIUM_ACID, RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE,
                RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE, RESOURCE_CATALYZED_GHODIUM_ALKALIDE];
            manifest["peace"].options.allowUnboosted = false;
        }
        return manifest;
    }

    // DEMO

    protected demoBody = () => {
        return this.demolisherBody();
    };

    protected demoMax = () => {
        if (this.memory.nextAttempt > Game.time) {
            return 0;
        } else {
            return 1;
        }
    };

    protected demoActions = (agent: CombatAgent) => {
        agent.attackStructures(this.roomName);
        let recovering = agent.recover();
        if (recovering) { return; }
        let traveling = agent.standardTravel(this.roomName);
        if (traveling) { return; }
        if (agent.pos.roomName === this.roomName) {
            let structureGoals = agent.structureGoals();
            agent.maneuver(structureGoals.approach, structureGoals.avoid);
        }
    };

    // HEALER

    protected healBody = () => {
        return this.healerBody();
    };

    protected healerMax = () => {
        if (this.memory.nextAttempt > Game.time) {
            return 0;
        } else {
            return 1;
        }
    };

    protected healerActions = (agent: CombatAgent) => {
        agent.healCreeps();

        let demo = _.head(this.agentManifest["demo"].agents);
        if (!demo) {
            agent.idleOffRoad();
            return;
        }

        agent.travelTo(demo);
    };

    private findBoost(): boolean {
        let terminal = this.spawnGroup.room.terminal;
        if (!terminal) { return false; }
        let moveBoost = terminal.store[RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE];
        if (!moveBoost || moveBoost < 1000) { return false; }
        let healBoost = terminal.store[RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE];
        if (!healBoost || healBoost < 1000) { return false; }
        let toughBoost = terminal.store[RESOURCE_CATALYZED_GHODIUM_ALKALIDE];
        if (!toughBoost || toughBoost < 1000) { return false; }
        let workBoost = terminal.store[RESOURCE_CATALYZED_ZYNTHIUM_ACID];
        if (!workBoost || workBoost < 1000) { return false; }
        return true;
    }
}
