import {Mission, MissionMemory} from "./Mission";
import {Operation} from "../operations/Operation";
import {Agent} from "../agents/Agent";
import {MatrixHelper} from "../../helpers/MatrixHelper";
import {Traveler} from "../../Traveler";

interface RemoteUpgradeMemory extends MissionMemory {
}

export class VeryRemoteUpgradeMission extends Mission {
    private target: Flag;
    private distance: number;
    private carts: Agent[];
    private upgraders: Agent[];

    public memory: RemoteUpgradeMemory;

    constructor(operation: Operation) {
        super(operation, "vremUpgrade");
    }

    protected init() {
    }

    protected update() {
        this.target = Game.flags[`${this.operation.name}_target`];
        if (this.target && this.distance === undefined) {
            let ret = Traveler.findTravelPath(this.flag.pos, this.target.pos);
            if (!ret.incomplete) {
                this.distance = ret.path.length;
            }
        }
    }

    protected cartBody = () => {
        return this.workerBody(0, 16, 8);
    };

    protected getMaxCarts = () => {
        return this.roleCount("upgrade");
    };

    protected upgraderBody = () => {
        return this.workerBody(16, 16, 16);
    };

    protected getMaxUpgraders = () => {
        if (!this.target || !this.target.room || this.target.room.controller.level === 8) { return 0; }
        return 8;
    };

    protected roleCall() {
        this.carts = this.headCount("cart", this.cartBody, this.getMaxCarts, {
            prespawn: this.distance,
        });

        this.upgraders = this.headCount("upgrade", this.upgraderBody, this.getMaxUpgraders, {
            prespawn: this.distance,
            memory: { boosts: [RESOURCE_CATALYZED_GHODIUM_ACID] },
        });
    }

    protected actions() {
        for (let cart of this.carts) {
            this.cartActions(cart);
        }

        for (let upgrader of this.upgraders) {
            this.upgraderActions(upgrader);
        }
    }

    protected finalize() {
    }

    protected invalidateCache() {
    }

    private cartActions(cart: Agent) {
        let movingToRoom = this.moveToRoom(cart, this.target);
        if (movingToRoom) { return; }

        let hasLoad = cart.hasLoad();
        if (!hasLoad) {
            cart.procureEnergy({nextDestination: agent => this.target });
            return;
        }

        let partner = this.findPartner(cart, this.upgraders);
        if (!partner || partner.room !== this.target.room) {
            partner = _(this.target.room.controller.pos.findInRange(this.upgraders, 3)).min(x => x.carry.energy);
            if (!_.isObject(partner)) {
                if (cart.pos.inRangeTo(this.target.room.controller, 6)) {
                    cart.idleOffRoad(this.target.room.controller);
                } else {
                    cart.travelTo(this.target.room.controller, {range: 4});
                }
                return;
            }
        }

        let callback = (roomName: string, matrix: CostMatrix) => {
            if (roomName === this.target.pos.roomName) {
                let clone = matrix.clone();
                let links = this.target.room.findStructures<StructureLink>(STRUCTURE_LINK);
                let link = this.target.room.controller.pos.findClosestByRange(links);
                MatrixHelper.blockOffPosition(clone, link, 1, 0xff);
                return clone;
            }
        };

        if (partner.carry.energy > partner.carryCapacity * .8) {
            cart.idleOffRoad(partner);
            return;
        }

        if (cart.isNearTo(partner)) {
            cart.transfer(partner.creep, RESOURCE_ENERGY);
        } else {
            cart.travelTo(partner, {roomCallback: callback});
        }
    }

    private upgraderActions(upgrader: Agent) {
        let movingToRoom = this.moveToRoom(upgrader, this.target);
        if (movingToRoom) { return; }

        let cartPartner = this.findPartner(upgrader, this.carts);
        if (!cartPartner || cartPartner.room !== this.target.room) {
            let hasLoad = upgrader.hasLoad();
            if (!hasLoad) {
                upgrader.procureEnergy();
                return;
            }
        }

        let callback = (roomName: string, matrix: CostMatrix) => {
            if (roomName === this.target.pos.roomName) {
                let clone = matrix.clone();
                let links = this.target.room.findStructures<StructureLink>(STRUCTURE_LINK);
                let link = this.target.room.controller.pos.findClosestByRange(links);
                MatrixHelper.blockOffPosition(clone, link, 1, 0xff);
                return clone;
            }
        };

        if (upgrader.pos.inRangeTo(upgrader.room.controller, 3)) {
            upgrader.upgradeController(upgrader.room.controller);
        } else {
            upgrader.travelTo(upgrader.room.controller, {range: 3, roomCallback: callback});
        }
    }

    private moveToRoom(agent: Agent, flag: Flag): boolean {
        if (agent.room !== flag.room || agent.pos.isNearExit(1)) {
            agent.travelTo(flag);
            return true;
        }
    }
}
