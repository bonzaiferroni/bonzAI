import {MINERALS_RAW, RESERVE_AMOUNT, TradeNetwork, PRODUCT_LIST} from "./TradeNetwork";
export class MarketTrader {

    private network: TradeNetwork;

    constructor(network: TradeNetwork) {
        this.network = network;
    }

    public actions() {
        this.buyShortages();
        this.sellCompounds();
    }

    buyShortages() {
        if (Game.market.credits < Memory.playerConfig.creditReserveAmount) return; // early

        if (Game.time % 100 !== 2) return;

        // you could use a different constant here if you wanted to limit buying
        for (let mineralType of MINERALS_RAW) {

            let abundance = this.network.hasAbundance(mineralType, RESERVE_AMOUNT);
            if (!abundance) {
                console.log("EMPIRE: theres not enough", mineralType + ", attempting to purchase more");
                let terminal = this.findBestTerminal(mineralType);
                if (terminal)
                    this.buyMineral(terminal.room, mineralType);
            }
        }
    }

    private buyMineral(room: Room, resourceType: string) {
        if (room.terminal.store[resourceType] > TERMINAL_CAPACITY - RESERVE_AMOUNT) {
            console.log("EMPIRE: wanted to buy mineral but lowest terminal was full, check " + room.name);
            return;
        }

        this.removeOrders(ORDER_SELL, resourceType);
        let orders = Game.market.getAllOrders({type: ORDER_SELL, resourceType: resourceType});

        let bestOrder: Order;
        let lowestExpense = Number.MAX_VALUE;
        for (let order of orders) {
            if (order.remainingAmount < 100) continue;
            let expense = order.price;
            let transferCost = Game.market.calcTransactionCost(100, room.name, order.roomName) / 100;
            expense += transferCost * RESOURCE_VALUE[RESOURCE_ENERGY];
            if (expense < lowestExpense) {
                lowestExpense = expense;
                bestOrder = order;
                console.log("I could buy from", order.roomName, "for", order.price, "(+" + transferCost + ")");
            }
        }

        if (bestOrder) {
            let amount = Math.min(bestOrder.remainingAmount, RESERVE_AMOUNT);

            if (lowestExpense <= RESOURCE_VALUE[resourceType]) {
                let outcome = Game.market.deal(bestOrder.id, amount, room.name);
                console.log("bought", amount, resourceType, "from", bestOrder.roomName, "outcome:", outcome);
            }
            else {

            }

            let noBuyOrders = this.orderCount(ORDER_BUY, resourceType) === 0;
            if (noBuyOrders) {
                Game.market.createOrder(ORDER_BUY, resourceType, bestOrder.price, RESERVE_AMOUNT * 2, room.name);
                console.log("placed ORDER_BUY for", resourceType, "at", bestOrder.price, "Cr, to be sent to", room.name);
            }

            /*
             if (outcome === OK) {
             console.log("bought", amount, resourceType, "from", bestOrder.roomName, "outcome:", outcome);
             if (!Memory.dealHistory) {
             Memory.dealHistory = [];
             }

             this.addDeal(bestOrder);
             }
             else {
             console.log("there was a problem trying to deal:", outcome);
             }
             */
        }
    }

    sellCompounds() {
        if (Game.time % 100 !== 2) return;

        for (let compound of PRODUCT_LIST) {
            if (this.orderCount(ORDER_SELL, compound, PRODUCT_PRICE[compound]) > 0) continue;

            let stockedTerminals = _.filter(this.network.terminals, t => t.store[compound] >= RESERVE_AMOUNT);
            if (stockedTerminals.length === 0) continue;
            console.log("MARKET: no orders for", compound, "found, creating one");
            let competitionRooms = _.map(Game.market.getAllOrders({type: ORDER_SELL, resourceType: compound}), (order: Order) => {
                return order.roomName;
            });

            let distanceToNearest = 0;
            let bestTerminal: StructureTerminal;
            for (let terminal of stockedTerminals) {
                let nearestCompetition = Number.MAX_VALUE;
                for (let roomName of competitionRooms) {
                    let distance = Game.map.getRoomLinearDistance(roomName, terminal.room.name);
                    if (distance < nearestCompetition) { nearestCompetition = distance; }
                }
                if (nearestCompetition > distanceToNearest) {
                    distanceToNearest = nearestCompetition;
                    bestTerminal = terminal;
                    console.log("I could sell from", terminal.room.name + ", nearest competition is", nearestCompetition, "rooms away");
                }
            }

            Game.market.createOrder(ORDER_SELL, compound, PRODUCT_PRICE[compound], RESERVE_AMOUNT, bestTerminal.room.name);
        }
    }

    sellExcess(room: Room, resourceType: string, dealAmount: number) {
        let orders = Game.market.getAllOrders({type: ORDER_BUY, resourceType: resourceType});

        this.removeOrders(ORDER_BUY, resourceType);

        let bestOrder: Order;
        let highestGain = 0;
        for (let order of orders) {
            if (order.remainingAmount < 100) continue;
            let gain = order.price;
            let transferCost = Game.market.calcTransactionCost(100, room.name, order.roomName) / 100;
            gain -= transferCost * RESOURCE_VALUE[RESOURCE_ENERGY];
            if (gain > highestGain) {
                highestGain = gain;
                bestOrder = order;
                console.log("I could sell it to", order.roomName, "for", order.price, "(+" + transferCost + ")");
            }
        }

        if (bestOrder) {
            let amount = Math.min(bestOrder.remainingAmount, dealAmount);
            let outcome = Game.market.deal(bestOrder.id, amount, room.name);

            let notYetSelling = this.orderCount(ORDER_SELL, resourceType, bestOrder.price) === 0;
            if (notYetSelling) {
                Game.market.createOrder(ORDER_SELL, resourceType, bestOrder.price, dealAmount * 2, room.name);
                console.log("placed ORDER_SELL for", resourceType, "at", bestOrder.price, "Cr, to be sent from", room.name);
            }

            if (outcome === OK) {
                console.log("sold", amount, resourceType, "to", bestOrder.roomName, "outcome:", outcome);

            }
            else if (outcome === ERR_INVALID_ARGS) {
                console.log("invalid deal args:", bestOrder.id, amount, room.name);
            }
            else {
                console.log("there was a problem trying to deal:", outcome);
            }
        }
    }

    private removeOrders(type: string, resourceType: string) {
        for (let orderId in Game.market.orders) {
            let order = Game.market.orders[orderId];
            if (order.type === type && order.resourceType === resourceType) {
                Game.market.cancelOrder(orderId);
            }
        }
    }

    private orderCount(type: string, resourceType: string, adjustPrice?: number): number {
        let count = 0;
        for (let orderId in Game.market.orders) {
            let order = Game.market.orders[orderId];
            if (order.remainingAmount < 10) {
                Game.market.cancelOrder(orderId);
            }
            else if (order.type === type && order.resourceType === resourceType) {
                count++;
                if (adjustPrice && adjustPrice < order.price) {
                    console.log("MARKET: lowering price for", resourceType, type, "from", order.price, "to", adjustPrice);
                    Game.market.changeOrderPrice(order.id, adjustPrice);
                }
            }
        }
        return count;
    }

    public findBestTerminal(resourceType: string, searchType = "lowest"): StructureTerminal {
        if (searchType === "lowest") {
            let lowest = Number.MAX_VALUE;
            let lowestTerminal: StructureTerminal;
            for (let terminal of this.network.terminals) {
                let amount = terminal.store[resourceType] || 0;
                if (amount < lowest) {
                    lowest = amount;
                    lowestTerminal = terminal;
                }
            }
            return lowestTerminal;
        }
        else {
            let highest = 0;
            let highestTerminal: StructureTerminal;
            for (let terminal of this.network.terminals) {
                let amount = terminal.store[resourceType] || 0;
                if (amount > highest) {
                    highest = amount;
                    highestTerminal = terminal;
                }
            }
            return highestTerminal;
        }
    }
}

export const RESOURCE_VALUE = {
    energy: .05,
    H: 1,
    O: 1,
    Z: 1,
    K: 1,
    U: 1,
    L: 1,
    X: 1,
};

export const PRODUCT_PRICE = {
    XUH2O: 4,
    XLHO2: 4,
    XKHO2: 4,
    XZHO2: 4,
    XZH2O: 4,
    XLH2O: 4,
    XGH2O: 6,
    XGHO2: 6,
    G: 2,
};