
export interface INodeRed {
    nodes: {
        createNode: (node: any, n: any) => void;
        getNode(id: string): INodeRedNode;
        // registerType: (name: string, node: any, options?: any) => void;
        registerType<T,C>(name: string, constructor: (this: T, config: C) => void): void;
    }
}

export interface INodeRedNode {

}

export class CNodeRedNode {
    name: string;
    error(msg: string, msg2?: any): void {

    }
    log(msg: string): void {

    }
    warn(msg: string): void{

    }    
    debug(msg: string): void{

    }
    constructor(options: { name: string; }) {
        this.name = options.name;
    }
}