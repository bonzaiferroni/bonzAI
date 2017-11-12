import {Operation} from "./Operation";
import {core} from "../Empire";
import {Mission} from "../missions/Mission";
import {OperationPriority} from "../../config/constants";
import {CombatAgent} from "../agents/CombatAgent";
import {Notifier} from "../../notifier";

export class StumpOperation extends Operation {

    constructor(flag: Flag, name: string, type: string) {
        super(flag, name, type);
        this.priority = OperationPriority.High;
    }

    protected init() {
        this.spawnGroup = core.getSpawnGroup(this.roomName);
        this.addMission(new StumpMission(this))
    }

    protected update() {
    }

    protected finalize() {
    }

    protected invalidateCache() {
    }

}

export class StumpMission extends Mission {

    protected stumps: CombatAgent[];

    protected target: Flag;

    constructor(operation: Operation) {
        super(operation, "healStump");
    }

    protected init() {
    }

    protected update() {
        this.target = Game.flags[`${this.operation.name}_target`];
    }

    protected maxStumps = () => {
        if (!this.target) { return 0; }
        return this.operation.memory["max"] === undefined ? 6 : this.operation.memory["max"];
    };

    protected stumpBody = () => {
        return this.unitBody({[MOVE]: 2, [RANGED_ATTACK]: 1, [HEAL]: 3})
    };

    protected deathNotify = (roleName: string, earlyDeath: boolean) => {
        if (earlyDeath) {
            if (this.operation.memory["killSwitch"]) {
                Notifier.log(`killing ${this.operation.name} :'(`, 1);
                this.operation.memory["max"] = 0;
            }
        } else {
            Notifier.log(`RIP ${roleName} of ${this.operation.name} :')`, 1);
        }
    };

    protected roleCall() {
        this.stumps = this.headCountAgents(CombatAgent, "stump", this.stumpBody, this.maxStumps, {
            deathCallback: this.deathNotify
        })
    }

    protected actions() {
        let order = 0;
        let lastStump;
        for (let stump of this.stumps) {
            this.stumpActions(stump, order, lastStump);
            lastStump = stump;
            order++;
        }
    }

    protected finalize() {
    }

    protected invalidateCache() {
    }

    private stumpActions(stump: CombatAgent, order: number, lastStump: CombatAgent) {
        stump.healCreeps();
        stump.attackCreeps();
        stump.attackStructures(this.target.pos.roomName);
        if (!this.target) {
            stump.travelTo(this.flag);
            return;
        }

        if (this.stumps.length < 4) {
            this.congaFormation(stump, order, lastStump);
        } else {
            this.stumpFormation(stump, order, lastStump);
        }
    }

    private congaFormation(stump: CombatAgent, order: number, lastStump: CombatAgent) {
        if (order === 0) {
            stump.travelTo(this.target);
        } else {
            stump.travelTo(lastStump);
        }
    }

    private stumpFormation(stump: CombatAgent, order: number, lastStump: CombatAgent) {
        let positions = [];
        for (let direction = 1; direction <= 8; direction++) {
            positions.push(this.target.pos.getPositionAtDirection(direction));
        }

        let position: RoomPosition;
        if (order === 0) {
            position = positions[7];
        } else if (order === 1) {
            position = positions[0];
        } else if (order === 2) {
            position = positions[6];
        } else if (order === 3) {
            position = this.target.pos;
        } else if (order === 4) {
            position = positions[5];
        } else if (order === 5) {
            position = positions[4];
        } else if (order === 6) {
            position = positions[3];
        } else if (order === 7) {
            position = positions[2];
        } else if (order === 8) {
            position = positions[1];
        }

        if (!position) {
            stump.travelTo(lastStump);
            return;
        }

        stump.travelTo(position);
    }
}