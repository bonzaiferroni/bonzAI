import {Guru} from "./Guru";
import {Operation} from "../operations/Operation";
import {HostileAgent} from "../agents/HostileAgent";
export class InvaderGuru extends Guru {

    public invaders: HostileAgent[] = [];
    public invadersPresent: boolean;
    public hasVision = false;

    public memory: {
        invaderProbable: boolean
        invaderTrack: {
            energyHarvested: number,
            tickLastSeen: number,
            energyPossible: number,
        }
    };

    constructor(operation: Operation) {
        super(operation, "invaderGuru");
    }

    public init() {
        super.init();
        if (!this.memory.invaderTrack) {
            this.memory.invaderTrack = {
                energyHarvested: 0,
                tickLastSeen: Game.time,
                energyPossible: 0,
            };
        }
    }

    public refresh() {
        super.refresh();
        if (!this.room) { return; }
        this.hasVision = true;
        for (let creep of _.filter(this.room.hostiles, c => c.owner.username === "Invader")) {
            this.invaders.push(new HostileAgent(creep));
        }

        this.trackEnergyTillInvader();
        this.invadersPresent = this.invaders.length > 0;
    }

    /**
     * Tracks energy harvested and pre-spawns a defender when an invader becomes likely
     */

    get invaderProbable(): boolean { return this.memory.invaderProbable; }

    private trackEnergyTillInvader() {
        let memory = this.memory.invaderTrack;

        let harvested = 0;
        let possible = 0;
        let sources = this.room.find(FIND_SOURCES) as Source[];
        for (let source of sources) {
            if (source.ticksToRegeneration === 1) {
                harvested += source.energyCapacity - source.energy;
                possible += source.energyCapacity;
            }
        }

        memory.energyHarvested += harvested;
        memory.energyPossible += possible;

        if (sources.length === 3) {
            this.memory.invaderProbable = memory.energyHarvested > 65000;
        } else if (sources.length === 2 && Game.time - memory.tickLastSeen < 20000) {
            this.memory.invaderProbable = memory.energyHarvested > 75000;
        } else if (sources.length === 1 && Game.time - memory.tickLastSeen < 20000) {
            this.memory.invaderProbable = memory.energyHarvested > 90000;
        } else {
            this.memory.invaderProbable = false;
        }

        if (this.invaders.length > 0 && Game.time - memory.tickLastSeen > CREEP_LIFE_TIME) {
            // reset trackers
            memory.energyPossible = 0;
            memory.energyHarvested = 0;
            memory.tickLastSeen = Game.time;
        }
    }
}
