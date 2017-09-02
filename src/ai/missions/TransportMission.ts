import {Mission, MissionMemory} from "./Mission";
import {Operation} from "../operations/Operation";
import {helper} from "../../helpers/helper";
import {Agent} from "../agents/Agent";

export class TransportMission extends Mission {

    private carts: Agent[];
    private maxCarts: number;
    private origin: StructureContainer | StructureStorage | StructureTerminal;
    private destination: StructureContainer | StructureStorage | StructureTerminal;
    private resourceType: string;
    private offroad: boolean;
    public waypoints: Flag[];
    public memory: any;

    constructor(operation: Operation, maxCarts: number,
                origin?: StructureContainer | StructureStorage | StructureTerminal,
                destination?: StructureContainer | StructureStorage | StructureTerminal,
                resourceType?: string, offroad = false) {
        super(operation, "transport");
        this.maxCarts = maxCarts;
        if (origin) {
            this.origin = origin;
            this.memory.originPos = origin.pos;
        }
        if (destination) {
            this.destination = destination;
            this.memory.destinationPos = destination.pos;
        }
        this.resourceType = resourceType;
        this.offroad = offroad;
    }

    public init() { }

    public update() {
        this.waypoints = [];
        if (!this.origin) {
            let originFlag = Game.flags[this.operation.name + "_origin"];
            if (originFlag) {
                this.memory.originPos = originFlag.pos;
                if (originFlag.room) {
                    this.origin = originFlag.pos.lookFor(
                        LOOK_STRUCTURES)[0] as StructureContainer | StructureStorage | StructureTerminal;
                }
            }
        }
        if (!this.destination) {
            let destinationFlag = Game.flags[this.operation.name + "_destination"];
            if (destinationFlag) {
                this.memory.destinationPos = destinationFlag.pos;
                if (destinationFlag.room) {
                    this.destination = destinationFlag.pos.lookFor(
                        LOOK_STRUCTURES)[0] as StructureContainer | StructureStorage | StructureTerminal;
                }
            }
        }

        this.waypoints = this.getFlagSet("_waypoints_", 1);
    }

    public roleCall() {

        let body = () => {
            if (this.offroad) {
                return this.workerUnitBody(0, 1, 1);
            } else {
                return this.workerUnitBody(0, 2, 1);
            }
        };

        let memory = { scavenger: this.resourceType, prep: true };
        this.carts = this.headCount("cart", body, () => this.maxCarts, {memory: memory});
    }

    public actions() {

        for (let cart of this.carts) {
            if (!this.memory.originPos || !this.memory.destinationPos) {
                cart.idleNear(this.flag);
            }

            this.cartActions(cart);
        }
    }

    public finalize() {
    }

    public invalidateCache() {
    }

    private cartActions(cart: Agent) {

        let hasLoad = cart.hasLoad();
        if (!hasLoad) {
            if (!this.origin) {
                let originPos = helper.deserializeRoomPosition(this.memory.originPos);
                cart.travelTo(originPos);
            } else if (!cart.pos.isNearTo(this.origin)) {
                cart.travelTo(this.origin);
            } else {
                let outcome;
                if (this.resourceType) {
                    outcome = cart.withdraw(this.origin, this.resourceType);
                } else if (this.origin instanceof StructureLab) {
                    outcome = cart.withdraw(this.origin, (this.origin as StructureLab).mineralType);
                } else {
                    outcome = cart.withdrawEverything(this.origin);
                }
                if (outcome === OK) {
                    cart.travelTo(this.destination);
                }
            }
            return; // early
        }

        // hasLoad = true
        if (!this.destination) {
            let destinationPos = helper.deserializeRoomPosition(this.memory.destinationPos);
            cart.travelTo(destinationPos);
        } else if (!cart.pos.isNearTo(this.destination)) {
            cart.travelTo(this.destination);
        } else {
            let outcome;
            if (this.resourceType) {
                outcome = cart.transfer(this.destination, this.resourceType);
            } else {
                outcome = cart.transferEverything(this.destination);
            }
            if (outcome === OK) {
                cart.travelTo(this.origin);
            }
        }
    }
}
