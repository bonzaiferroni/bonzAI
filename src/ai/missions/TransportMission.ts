import {Mission} from "./Mission";
import {Operation} from "../operations/Operation";
import {helper} from "../../helpers/helper";
export class TransportMission extends Mission {

    carts: Creep[];
    maxCarts: number;
    origin: StructureContainer | StructureStorage | StructureTerminal;
    destination: StructureContainer | StructureStorage | StructureTerminal;
    resourceType: string;
    offroad: boolean;
    waypoints: Flag[];

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

    initMission() {
        this.waypoints = [];
        if (!this.origin) {
            let originFlag = Game.flags[this.opName + "_origin"];
            if (originFlag) {
                this.memory.originPos = originFlag.pos;
                if (originFlag.room) {
                    this.origin = originFlag.pos.lookFor(LOOK_STRUCTURES)[0] as StructureContainer | StructureStorage | StructureTerminal;
                }
            }
        }
        if (!this.destination) {
            let destinationFlag = Game.flags[this.opName + "_destination"];
            if (destinationFlag) {
                this.memory.destinationPos = destinationFlag.pos;
                if (destinationFlag.room) {
                    this.destination = destinationFlag.pos.lookFor(LOOK_STRUCTURES)[0] as StructureContainer | StructureStorage | StructureTerminal;
                }
            }
        }

        this.waypoints = this.getFlagSet("_waypoints_", 1);
    }

    roleCall() {

        let body = () => {
            if (this.offroad) {
                return this.bodyRatio(0, 1, 1, 1);
            }
            else {
                return this.bodyRatio(0, 2, 1, 1);
            }
        };

        let memory = { scavanger: this.resourceType, prep: true };
        this.carts = this.headCount("cart", body, this.maxCarts, {memory: memory});
    }

    missionActions() {

        for (let cart of this.carts) {
            if (!this.memory.originPos || !this.memory.destinationPos) {
                this.moveToFlag(cart);
            }

            this.cartActions(cart);
        }
    }

    finalizeMission() {
    }

    invalidateMissionCache() {
    }

    private cartActions(cart: Creep) {

        let hasLoad = this.hasLoad(cart);
        if (!hasLoad) {
            if (!this.origin) {
                let originPos = helper.deserializeRoomPosition(this.memory.originPos);
                cart.blindMoveTo(originPos);
            }
            else if (!cart.pos.isNearTo(this.origin)) {
                cart.blindMoveTo(this.origin);
            }
            else {
                let outcome;
                if (this.resourceType) {
                    outcome = cart.withdraw(this.origin, this.resourceType);
                }
                else if (this.origin instanceof StructureLab) {
                    outcome = cart.withdraw(this.origin, (this.origin as StructureLab).mineralType);
                }
                else {
                    outcome = cart.withdrawEverything(this.origin);
                }
                if (outcome === OK) {
                    cart.blindMoveTo(this.destination);
                }
            }
            return; // early
        }

        // hasLoad = true
        if (!this.destination) {
            let destinationPos = helper.deserializeRoomPosition(this.memory.destinationPos);
            cart.blindMoveTo(destinationPos);
        }
        else if (!cart.pos.isNearTo(this.destination)) {
            cart.blindMoveTo(this.destination);
        }
        else {
            let outcome;
            if (this.resourceType) {
                outcome = cart.transfer(this.destination, this.resourceType);
            }
            else {
                outcome = cart.transferEverything(this.destination);
            }
            if (outcome === OK) {
                cart.blindMoveTo(this.origin);
            }
        }
    }
}