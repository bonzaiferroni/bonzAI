import {Mission, MissionMemory} from "./Mission";
import {Operation} from "../operations/Operation";
import {empire} from "../Empire";
import {Agent} from "../agents/Agent";

interface RemoteUpgradeMemory extends MissionMemory {
    upgraderCount: number;
}

export class RemoteUpgradeMission extends Mission {
    private target: Flag;
    private upgraderCount: number;
    private distance: number;
    private carts: Agent[];
    private upgraders: Agent[];

    public memory: RemoteUpgradeMemory;

    constructor(operation: Operation) {
        super(operation, "remUpgrade");
    }

    protected init() {
        if (this.memory.upgraderCount === undefined) {
            this.memory.upgraderCount = 0;
        }
    }

    protected update() {
        this.target = Game.flags[`${this.operation.name}_target`];
        if (this.target && this.distance === undefined) {
            let ret = empire.traveler.findTravelPath(this.flag.pos, this.target.pos);
            if (!ret.incomplete) {
                this.distance = ret.path.length;
            }
        }
    }

    protected cartBody = () => {
        return this.workerBody(0, 32, 16);
    };

    protected getMaxCarts = () => {
        return Math.floor(this.upgraderCount / 2);
    };

    protected upgraderBody = () => {
        return this.workerBody(20, 10, 20);
    };

    protected getMaxUpgraders = () => {
        if (!this.target) { return 0; }
        return 6;
    };

    protected roleCall() {
        this.carts = this.headCount("cart", this.cartBody, this.getMaxCarts, {
            prespawn: this.distance,
        });

        this.upgraders = this.headCount("upgrade", this.cartBody, this.getMaxCarts, {
            prespawn: this.distance,
        });

        this.memory.upgraderCount++;
    }

    protected actions() {
    }

    protected finalize() {
    }

    protected invalidateCache() {
    }

}