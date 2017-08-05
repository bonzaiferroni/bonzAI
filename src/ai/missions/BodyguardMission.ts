import {Mission} from "./Mission";
import {Operation} from "../operations/Operation";
import {Agent} from "../agents/Agent";
import {InvaderGuru} from "./InvaderGuru";

export class BodyguardMission extends Mission {

    private defenders: Agent[];
    private hostiles: Creep[];
    private invaderGuru: InvaderGuru;
    private potency: number;
    private prespawn: number;

    /**
     * Remote defense for non-owned rooms. If boosted invaders are likely, use EnhancedBodyguardMission
     * @param operation
     * @param invaderGuru
     * @param allowSpawn
     */

    constructor(operation: Operation, invaderGuru?: InvaderGuru, allowSpawn = true) {
        super(operation, "bodyguard", allowSpawn);
        this.invaderGuru = invaderGuru;
    }

    protected init() {
        this.prespawn = Game.map.getRoomLinearDistance(this.roomName, this.spawnGroup.room.name) * 50;
        this.potency = this.findPotency();
    }

    public update() {
        if (!this.state.hasVision) { return; } // early
        this.hostiles = this.room.hostiles;
    }

    private getBody = () => {
        if (!this.potency) {
            this.potency = this.findPotency();
        }

        if (this.potency === 0) {
            if (this.operation.remoteSpawn) {
                this.spawnGroup = this.operation.remoteSpawn.spawnGroup;
                this.potency = this.findPotency();
            }

            if (this.potency === 0) {
                return this.configBody({
                    move: 4,
                    attack: 3,
                    heal: 1,
                });
            }
        }

        return this.configBody({
            tough: this.potency,
            move: this.potency * 6,
            attack: this.potency * 3,
            heal: this.potency * 2,
        });
    };

    private maxDefenders = () => {
        if (!this.state.hasVision) { return 1; }
        let maxDefenders = 0;
        if (this.invaderGuru && (this.invaderGuru.invaderProbable || this.invaderGuru.invadersPresent)) {
            maxDefenders = 1;
        }
        if (this.operation.type !== "mining" && this.room.findStructures(STRUCTURE_TOWER).length === 0) {
            maxDefenders = 1;
        }
        return maxDefenders;
    };

    public roleCall() {
        this.defenders = this.headCount("leeroy", this.getBody, this.maxDefenders, { prespawn: this.prespawn } );
    }

    public actions() {

        for (let defender of this.defenders) {
            this.defenderActions(defender);
        }
    }

    public finalize() {
    }

    public invalidateCache() {
    }

    private defenderActions(defender: Agent) {

        let flag = Game.flags[`${this.operation.name}_hit`];
        if (flag) {
            let structure = flag.pos.lookFor<Structure>(LOOK_STRUCTURES)[0];
            if (structure) {
                defender.attack(structure);
                defender.travelTo(structure, {range: 1});
                return;
            } else {
                flag.remove();
            }
        }

        if (!this.state.hasVision || this.hostiles.length === 0) {
            if (defender.hits < defender.hitsMax) {
                defender.heal(defender);
            } else {
                this.medicActions(defender);
            }
            return; // early
        }

        let attacking = false;
        let closest: Structure | Creep = defender.pos.findClosestByRange(this.hostiles);
        if (closest) {
            let range = defender.pos.getRangeTo(closest);
            if (range > 3) {
                defender.travelTo(closest);
            } else if (range > 1) {
                let direction = defender.fleeBuster(closest);
                if (direction) {
                    defender.move(direction);
                } else {
                    defender.travelTo(closest);
                }
            } else {
                attacking = defender.attack(closest) === OK;
                defender.move(defender.pos.getDirectionTo(closest));
            }
        } else {
            defender.travelTo(this.hostiles[0]);
        }

        if (!attacking && defender.hits < defender.hitsMax) {
            defender.heal(defender);
        }
    }

    private findPotency() {
        let unit = this.configBody({
            tough: 1,
            move: 6,
            attack: 3,
            heal: 2,
        });
        return Math.min(this.spawnGroup.maxUnits(unit, 1), 3);
    }
}
