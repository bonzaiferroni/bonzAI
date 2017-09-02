import {Operation} from "./Operation";
import {Mission, MissionMemory} from "../missions/Mission";
import {empire} from "../Empire";
import {Agent} from "../agents/Agent";
import {OperationPriority} from "../../config/constants";
export class SandboxOperation extends Operation {

    constructor(flag: Flag, name: string, type: string) {
        super(flag, name, type);
        this.priority = OperationPriority.High;
    }

    public init() {
        this.spawnGroup = empire.getSpawnGroup(this.roomName);
        this.addMission(new SandboxMission(this));
    }
    public update() {
    }

    public finalize() {
    }

    public invalidateCache() {
    }

}

interface SandboxMemory extends MissionMemory {
    nextSpawn: number;
    spawnCount: number;
    posIndex: number;
    chant: string[];
    direction: number;
    reverse: boolean;
    max: number;
}

export class SandboxMission extends Mission {
    private target: Flag;
    private interval = 150;
    private protesters: Agent[];
    protected memory: SandboxMemory;

    constructor(operation: Operation) {
        super(operation, "sandbox");
    }

    public init() {
    }
    public update() {
        this.target = Game.flags[`${this.operation.name}_target`];
        if (!this.memory.nextSpawn) {
            this.memory.nextSpawn = Game.time;
            this.memory.spawnCount = 0;
        } else if (this.roleCount("protester") > this.memory.spawnCount) {
            this.memory.spawnCount = this.roleCount("protester");
            this.memory.nextSpawn = Game.time + this.interval;
        }
    }
    public getMax = () => {
        if (!this.target) { return 0; }
        if (Game.time >= this.memory.nextSpawn) {
            return this.roleCount("protester") + 1;
        } else {
            return 0;
        }
    };
    public roleCall() {
        this.protesters = this.headCount("protester", () => [MOVE], this.getMax);
    }
    public actions() {
        let order = 0;
        for (let protester of this.protesters) {
            this.protesterActions(protester, order);
            order++;
        }
    }
    public finalize() {
    }
    public invalidateCache() {
    }

    private protesterActions(protester: Agent, order: number) {

        let chant = ["no justice", "no peace"];
        if (this.memory.chant) {
            chant = this.memory.chant;
        }

        let index = Game.time % chant.length;
        protester.say(chant[index], true);

        let fleeing = protester.fleeHostiles();
        if (fleeing) { return; }

        if (order === 0) {
            if (protester.pos.roomName === this.target.pos.roomName && !protester.pos.isNearExit(0)) {
                let positions = this.target.pos.openAdjacentSpots(true);
                let position = positions[this.memory.posIndex];
                if (this.memory.reverse) {
                    if (this.memory.posIndex === undefined || this.memory.posIndex < 0) {
                        this.memory.posIndex = positions.length - 1;
                    }
                    position = positions[this.memory.posIndex];
                    if (protester.isNearTo(position)) {
                        this.memory.posIndex--;
                    }
                } else {
                    if (this.memory.posIndex === undefined || this.memory.posIndex >= positions.length) {
                        this.memory.posIndex = 0;
                    }
                    position = positions[this.memory.posIndex];
                    if (protester.isNearTo(position)) {
                        this.memory.posIndex++;
                    }
                }
                protester.travelTo(position, {preferHighway: true});
            } else {
                protester.travelTo(this.target, {preferHighway: true});
            }
        } else {
            if (protester.pos.roomName === this.target.pos.roomName && !protester.pos.isNearExit(0)) {
                let leader = this.protesters[order - 1];
                protester.travelTo(leader, {stuckValue: 50});
            } else {
                protester.travelTo(this.target, {preferHighway: true});
            }
        }
    }
}
