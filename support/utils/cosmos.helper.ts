import {
    Container,
    CosmosClient,
    ItemDefinition,
    SqlQuerySpec,
} from "@azure/cosmos";

type Environment = "qa" | "stg";

class CosmosHelper {
    private client: CosmosClient | null = null;
    private currentEnv: Environment | null = null;

    private async loadEnvFile(env: Environment): Promise<void> {
        const dotenv = await import("dotenv");
        const path = await import("path");
        const envPath = path.resolve(
            process.cwd(),
            "config/envs",
            `.env.${env}`,
        );
        dotenv.config({ path: envPath });
    }

    private async getCredentials(
        env: Environment,
    ): Promise<{ endpoint: string; key: string }> {
        let endpoint =
            env === "qa"
                ? process.env.COSMOS_QA_ENDPOINT
                : process.env.COSMOS_STG_ENDPOINT;
        let key =
            env === "qa"
                ? process.env.COSMOS_QA_KEY
                : process.env.COSMOS_STG_KEY;

        if (!endpoint || !key) {
            await this.loadEnvFile(env);
            endpoint =
                env === "qa"
                    ? process.env.COSMOS_QA_ENDPOINT
                    : process.env.COSMOS_STG_ENDPOINT;
            key =
                env === "qa"
                    ? process.env.COSMOS_QA_KEY
                    : process.env.COSMOS_STG_KEY;
        }

        return { endpoint: endpoint || "", key: key || "" };
    }

    private getEnv(): Environment {
        const env = process.env.NODE_ENV || "qa";
        return env === "stg" ? "stg" : "qa";
    }

    public async connect(): Promise<void> {
        const env = this.getEnv();

        if (this.client && this.currentEnv === env) {
            return;
        }

        const { endpoint, key } = await this.getCredentials(env);

        if (!endpoint || !key) {
            throw new Error(
                `[CosmosHelper] Missing credentials for env "${env}". ` +
                    `Check COSMOS_${env.toUpperCase()}_ENDPOINT and COSMOS_${env.toUpperCase()}_KEY env vars.`,
            );
        }

        this.client = new CosmosClient({ endpoint, key });
        this.currentEnv = env;
        console.log(
            `[CosmosHelper] Connected to CosmosDB (${env}): ${endpoint}`,
        );
    }

    private async getContainer(
        containerName: string,
        database?: string,
    ): Promise<Container> {
        if (!this.client) {
            await this.connect();
        }

        const db = database ?? process.env.COSMOS_DATABASE ?? "billPayments";
        return this.client!.database(db).container(containerName);
    }

    /**
     * Runs a SQL query and returns all matching items.
     * @param containerName - CosmosDB container name
     * @param query - SQL query string or SqlQuerySpec with parameters
     * @param options - Optional: override database name
     * @returns Array of results typed as T
     *
     * @example
     * const results = await cosmosHelper.query<Bill>(
     *   "bills",
     *   { query: "SELECT * FROM c WHERE c.status = @status", parameters: [{ name: "@status", value: "pending" }] },
     *   { database: "billPayments" }
     * );
     */
    public async query<T extends ItemDefinition>(
        containerName: string,
        query: string | SqlQuerySpec,
        options?: { database?: string },
    ): Promise<T[]> {
        const container = await this.getContainer(
            containerName,
            options?.database,
        );
        const { resources } = await container.items.query<T>(query).fetchAll();
        return resources;
    }

    /**
     * Finds a single item by its id.
     * @param containerName - CosmosDB container name
     * @param id - Document id
     * @param partitionKey - Partition key value (defaults to id if omitted)
     * @param options - Optional: override database name
     */
    public async findById<T extends ItemDefinition>(
        containerName: string,
        id: string,
        partitionKey?: string,
        options?: { database?: string },
    ): Promise<T | null> {
        const container = await this.getContainer(
            containerName,
            options?.database,
        );
        const { resource } = await container
            .item(id, partitionKey ?? id)
            .read<T>();
        return resource ?? null;
    }

    /**
     * Creates a new document in the container.
     * @param containerName - CosmosDB container name
     * @param document - Document to insert
     * @param options - Optional: override database name
     */
    public async create<T extends ItemDefinition>(
        containerName: string,
        document: T,
        options?: { database?: string },
    ): Promise<T> {
        const container = await this.getContainer(
            containerName,
            options?.database,
        );
        const { resource } = await container.items.create<T>(document);
        if (!resource) {
            throw new Error(
                `[CosmosHelper] Failed to create document in container "${containerName}"`,
            );
        }
        return resource;
    }

    /**
     * Replaces an existing document (full replace).
     * @param containerName - CosmosDB container name
     * @param id - Document id
     * @param partitionKey - Partition key value
     * @param document - New document body
     * @param options - Optional: override database name
     */
    public async replace<T extends ItemDefinition>(
        containerName: string,
        id: string,
        partitionKey: string,
        document: T,
        options?: { database?: string },
    ): Promise<T> {
        const container = await this.getContainer(
            containerName,
            options?.database,
        );
        const { resource } = await container
            .item(id, partitionKey)
            .replace<T>(document);
        if (!resource) {
            throw new Error(
                `[CosmosHelper] Failed to replace document "${id}" in container "${containerName}"`,
            );
        }
        return resource;
    }

    /**
     * Deletes a document by id.
     * @param containerName - CosmosDB container name
     * @param id - Document id
     * @param partitionKey - Partition key value
     * @param options - Optional: override database name
     */
    public async delete(
        containerName: string,
        id: string,
        partitionKey: string,
        options?: { database?: string },
    ): Promise<void> {
        const container = await this.getContainer(
            containerName,
            options?.database,
        );
        await container.item(id, partitionKey).delete();
    }

    public disconnect(): void {
        this.client = null;
        this.currentEnv = null;
        console.log("[CosmosHelper] Disconnected from CosmosDB.");
    }
}

export const cosmosHelper = new CosmosHelper();
