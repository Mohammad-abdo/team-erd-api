/**
 * Seed: users, one fully-populated project with ERD tables, columns, relations,
 * API groups, routes, parameters, responses, comments, activity logs,
 * notifications, and permissions.
 *
 * Run: npx prisma db seed
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import {
  PrismaClient,
  ProjectMemberRole,
  PermissionResource,
  PermissionAction,
  ProjectVisibility,
  HttpMethod,
  ApiRouteStatus,
  ApiParameterLocation,
  ErdRelationType,
  CommentableType,
} from "@prisma/client";

const prisma = new PrismaClient();

const SEED_PASSWORD = "adminabdo123";
const PROJECT_SLUG = "e-commerce-platform";

const USERS = [
  { email: "admin@team.com", name: "Abdo Admin", key: "admin" },
  { email: "editor@dbforge.seed", name: "Sara Editor", key: "editor" },
  { email: "viewer@dbforge.seed", name: "Vic Viewer", key: "viewer" },
  { email: "commenter@dbforge.seed", name: "Casey Commenter", key: "commenter" },
];

async function main() {
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10);

  console.log("Seeding users…");
  const byKey = {};
  for (const u of USERS) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      create: { email: u.email, name: u.name, passwordHash, isActive: true },
      update: { name: u.name, passwordHash, isActive: true },
    });
    byKey[u.key] = user;
  }

  const admin = byKey.admin;
  const editor = byKey.editor;
  const viewer = byKey.viewer;
  const commenter = byKey.commenter;

  const existing = await prisma.project.findUnique({ where: { slug: PROJECT_SLUG } });
  if (existing) {
    console.log("Removing existing seed project…");
    await prisma.project.delete({ where: { id: existing.id } });
  }

  /* ────────────────────────────────────
   *  PROJECT + MEMBERS
   * ──────────────────────────────────── */
  console.log("Creating project + team members…");
  const project = await prisma.project.create({
    data: {
      name: "E-Commerce Platform",
      slug: PROJECT_SLUG,
      description:
        "Full-stack e-commerce platform with user authentication, product catalog, shopping cart, order management, and payment integration. Designed for scalability and real-time inventory tracking.",
      visibility: ProjectVisibility.PRIVATE,
      leaderId: admin.id,
      healthStage: "active",
      lastActivityAt: new Date(),
      members: {
        create: [
          { userId: admin.id, role: ProjectMemberRole.LEADER },
          { userId: editor.id, role: ProjectMemberRole.EDITOR, invitedById: admin.id },
          { userId: viewer.id, role: ProjectMemberRole.VIEWER, invitedById: admin.id },
          { userId: commenter.id, role: ProjectMemberRole.COMMENTER, invitedById: admin.id },
        ],
      },
    },
  });

  /* ────────────────────────────────────
   *  ERD TABLES + COLUMNS
   * ──────────────────────────────────── */
  console.log("Creating ERD tables + columns…");

  const usersTable = await prisma.erdTable.create({
    data: {
      projectId: project.id, name: "users", label: "Users", color: "#10b981",
      groupName: "Auth", x: 100, y: 100, description: "Application users and authentication data",
      createdById: admin.id,
      columns: {
        create: [
          { name: "id", dataType: "BIGINT", isPk: true, isNullable: false, isUnique: true, sortOrder: 0 },
          { name: "email", dataType: "VARCHAR(255)", isNullable: false, isUnique: true, sortOrder: 1, description: "Unique login email" },
          { name: "password_hash", dataType: "VARCHAR(255)", isNullable: false, sortOrder: 2 },
          { name: "name", dataType: "VARCHAR(200)", isNullable: false, sortOrder: 3 },
          { name: "avatar_url", dataType: "TEXT", isNullable: true, sortOrder: 4 },
          { name: "role", dataType: "ENUM('CUSTOMER','ADMIN','SELLER')", isNullable: false, defaultValue: "CUSTOMER", sortOrder: 5 },
          { name: "is_verified", dataType: "BOOLEAN", isNullable: false, defaultValue: "false", sortOrder: 6 },
          { name: "created_at", dataType: "TIMESTAMP", isNullable: false, defaultValue: "NOW()", sortOrder: 7 },
          { name: "updated_at", dataType: "TIMESTAMP", isNullable: false, sortOrder: 8 },
        ],
      },
    },
    include: { columns: true },
  });

  const categoriesTable = await prisma.erdTable.create({
    data: {
      projectId: project.id, name: "categories", label: "Categories", color: "#8b5cf6",
      groupName: "Catalog", x: 500, y: 100, description: "Product categories with nested hierarchy support",
      createdById: admin.id,
      columns: {
        create: [
          { name: "id", dataType: "BIGINT", isPk: true, isNullable: false, isUnique: true, sortOrder: 0 },
          { name: "name", dataType: "VARCHAR(150)", isNullable: false, sortOrder: 1 },
          { name: "slug", dataType: "VARCHAR(150)", isNullable: false, isUnique: true, sortOrder: 2 },
          { name: "parent_id", dataType: "BIGINT", isNullable: true, isFk: true, sortOrder: 3, description: "Self-referencing for sub-categories" },
          { name: "image_url", dataType: "TEXT", isNullable: true, sortOrder: 4 },
          { name: "sort_order", dataType: "INT", isNullable: false, defaultValue: "0", sortOrder: 5 },
        ],
      },
    },
    include: { columns: true },
  });

  const productsTable = await prisma.erdTable.create({
    data: {
      projectId: project.id, name: "products", label: "Products", color: "#0ea5e9",
      groupName: "Catalog", x: 500, y: 350, description: "Product catalog with pricing, inventory and SEO metadata",
      createdById: editor.id,
      columns: {
        create: [
          { name: "id", dataType: "BIGINT", isPk: true, isNullable: false, isUnique: true, sortOrder: 0 },
          { name: "category_id", dataType: "BIGINT", isNullable: false, isFk: true, sortOrder: 1 },
          { name: "seller_id", dataType: "BIGINT", isNullable: false, isFk: true, sortOrder: 2, description: "References users.id where role = SELLER" },
          { name: "name", dataType: "VARCHAR(300)", isNullable: false, sortOrder: 3 },
          { name: "slug", dataType: "VARCHAR(300)", isNullable: false, isUnique: true, sortOrder: 4 },
          { name: "description", dataType: "TEXT", isNullable: true, sortOrder: 5 },
          { name: "price", dataType: "DECIMAL(12,2)", isNullable: false, sortOrder: 6 },
          { name: "compare_at_price", dataType: "DECIMAL(12,2)", isNullable: true, sortOrder: 7, description: "Original price before discount" },
          { name: "sku", dataType: "VARCHAR(100)", isNullable: true, isUnique: true, sortOrder: 8 },
          { name: "stock_quantity", dataType: "INT", isNullable: false, defaultValue: "0", sortOrder: 9 },
          { name: "is_published", dataType: "BOOLEAN", isNullable: false, defaultValue: "false", sortOrder: 10 },
          { name: "created_at", dataType: "TIMESTAMP", isNullable: false, defaultValue: "NOW()", sortOrder: 11 },
        ],
      },
    },
    include: { columns: true },
  });

  const ordersTable = await prisma.erdTable.create({
    data: {
      projectId: project.id, name: "orders", label: "Orders", color: "#f59e0b",
      groupName: "Commerce", x: 100, y: 350, description: "Customer orders with status tracking and payment info",
      createdById: admin.id,
      columns: {
        create: [
          { name: "id", dataType: "BIGINT", isPk: true, isNullable: false, isUnique: true, sortOrder: 0 },
          { name: "user_id", dataType: "BIGINT", isNullable: false, isFk: true, sortOrder: 1 },
          { name: "order_number", dataType: "VARCHAR(50)", isNullable: false, isUnique: true, sortOrder: 2 },
          { name: "status", dataType: "ENUM('PENDING','PAID','SHIPPED','DELIVERED','CANCELLED')", isNullable: false, defaultValue: "PENDING", sortOrder: 3 },
          { name: "subtotal", dataType: "DECIMAL(12,2)", isNullable: false, sortOrder: 4 },
          { name: "tax", dataType: "DECIMAL(12,2)", isNullable: false, defaultValue: "0", sortOrder: 5 },
          { name: "shipping_cost", dataType: "DECIMAL(12,2)", isNullable: false, defaultValue: "0", sortOrder: 6 },
          { name: "total", dataType: "DECIMAL(12,2)", isNullable: false, sortOrder: 7 },
          { name: "shipping_address", dataType: "JSON", isNullable: true, sortOrder: 8 },
          { name: "payment_intent_id", dataType: "VARCHAR(255)", isNullable: true, sortOrder: 9, description: "Stripe payment intent ID" },
          { name: "created_at", dataType: "TIMESTAMP", isNullable: false, defaultValue: "NOW()", sortOrder: 10 },
          { name: "updated_at", dataType: "TIMESTAMP", isNullable: false, sortOrder: 11 },
        ],
      },
    },
    include: { columns: true },
  });

  const orderItemsTable = await prisma.erdTable.create({
    data: {
      projectId: project.id, name: "order_items", label: "Order Items", color: "#f59e0b",
      groupName: "Commerce", x: 300, y: 550, description: "Line items belonging to an order",
      createdById: admin.id,
      columns: {
        create: [
          { name: "id", dataType: "BIGINT", isPk: true, isNullable: false, isUnique: true, sortOrder: 0 },
          { name: "order_id", dataType: "BIGINT", isNullable: false, isFk: true, sortOrder: 1 },
          { name: "product_id", dataType: "BIGINT", isNullable: false, isFk: true, sortOrder: 2 },
          { name: "quantity", dataType: "INT", isNullable: false, defaultValue: "1", sortOrder: 3 },
          { name: "unit_price", dataType: "DECIMAL(12,2)", isNullable: false, sortOrder: 4 },
          { name: "total", dataType: "DECIMAL(12,2)", isNullable: false, sortOrder: 5 },
        ],
      },
    },
    include: { columns: true },
  });

  const reviewsTable = await prisma.erdTable.create({
    data: {
      projectId: project.id, name: "reviews", label: "Reviews", color: "#ef4444",
      groupName: "Catalog", x: 750, y: 350, description: "Product reviews and ratings from verified buyers",
      createdById: editor.id,
      columns: {
        create: [
          { name: "id", dataType: "BIGINT", isPk: true, isNullable: false, isUnique: true, sortOrder: 0 },
          { name: "product_id", dataType: "BIGINT", isNullable: false, isFk: true, sortOrder: 1 },
          { name: "user_id", dataType: "BIGINT", isNullable: false, isFk: true, sortOrder: 2 },
          { name: "rating", dataType: "TINYINT", isNullable: false, sortOrder: 3, description: "1 to 5 stars" },
          { name: "title", dataType: "VARCHAR(200)", isNullable: true, sortOrder: 4 },
          { name: "body", dataType: "TEXT", isNullable: true, sortOrder: 5 },
          { name: "is_verified", dataType: "BOOLEAN", isNullable: false, defaultValue: "false", sortOrder: 6 },
          { name: "created_at", dataType: "TIMESTAMP", isNullable: false, defaultValue: "NOW()", sortOrder: 7 },
        ],
      },
    },
    include: { columns: true },
  });

  /* ────────────────────────────────────
   *  ERD RELATIONS
   * ──────────────────────────────────── */
  console.log("Creating ERD relations…");

  const col = (table, name) => table.columns.find((c) => c.name === name);

  await prisma.erdRelation.createMany({
    data: [
      { projectId: project.id, fromTableId: productsTable.id, toTableId: categoriesTable.id, relationType: ErdRelationType.MANY_TO_MANY, fromColumnId: col(productsTable, "category_id")?.id, toColumnId: col(categoriesTable, "id")?.id, label: "belongs to", createdById: admin.id },
      { projectId: project.id, fromTableId: productsTable.id, toTableId: usersTable.id, relationType: ErdRelationType.MANY_TO_MANY, fromColumnId: col(productsTable, "seller_id")?.id, toColumnId: col(usersTable, "id")?.id, label: "sold by", createdById: admin.id },
      { projectId: project.id, fromTableId: ordersTable.id, toTableId: usersTable.id, relationType: ErdRelationType.MANY_TO_MANY, fromColumnId: col(ordersTable, "user_id")?.id, toColumnId: col(usersTable, "id")?.id, label: "placed by", createdById: admin.id },
      { projectId: project.id, fromTableId: orderItemsTable.id, toTableId: ordersTable.id, relationType: ErdRelationType.MANY_TO_MANY, fromColumnId: col(orderItemsTable, "order_id")?.id, toColumnId: col(ordersTable, "id")?.id, label: "belongs to order", createdById: admin.id },
      { projectId: project.id, fromTableId: orderItemsTable.id, toTableId: productsTable.id, relationType: ErdRelationType.MANY_TO_MANY, fromColumnId: col(orderItemsTable, "product_id")?.id, toColumnId: col(productsTable, "id")?.id, label: "references product", createdById: admin.id },
      { projectId: project.id, fromTableId: reviewsTable.id, toTableId: productsTable.id, relationType: ErdRelationType.MANY_TO_MANY, fromColumnId: col(reviewsTable, "product_id")?.id, toColumnId: col(productsTable, "id")?.id, label: "reviews product", createdById: editor.id },
      { projectId: project.id, fromTableId: reviewsTable.id, toTableId: usersTable.id, relationType: ErdRelationType.MANY_TO_MANY, fromColumnId: col(reviewsTable, "user_id")?.id, toColumnId: col(usersTable, "id")?.id, label: "written by", createdById: editor.id },
      { projectId: project.id, fromTableId: categoriesTable.id, toTableId: categoriesTable.id, relationType: ErdRelationType.ONE_TO_MANY, fromColumnId: col(categoriesTable, "parent_id")?.id, toColumnId: col(categoriesTable, "id")?.id, label: "parent", createdById: admin.id },
    ],
  });

  /* ────────────────────────────────────
   *  API GROUPS + ROUTES + PARAMS + RESPONSES
   * ──────────────────────────────────── */
  console.log("Creating API documentation…");

  // Auth group
  const authGroup = await prisma.apiGroup.create({
    data: { projectId: project.id, name: "Authentication", prefix: "/api/auth", description: "User registration, login, and token management", sortOrder: 0 },
  });

  const registerRoute = await prisma.apiRoute.create({
    data: {
      groupId: authGroup.id, method: HttpMethod.POST, path: "/register",
      summary: "Register a new user account", description: "Creates a new user, hashes password, and returns JWT tokens.",
      authRequired: false, status: ApiRouteStatus.STABLE, createdById: admin.id,
    },
  });
  await prisma.apiParameter.createMany({
    data: [
      { routeId: registerRoute.id, location: ApiParameterLocation.BODY, name: "name", dataType: "string", isRequired: true, description: "User display name", example: "John Doe" },
      { routeId: registerRoute.id, location: ApiParameterLocation.BODY, name: "email", dataType: "string", isRequired: true, description: "Unique email address", example: "john@example.com" },
      { routeId: registerRoute.id, location: ApiParameterLocation.BODY, name: "password", dataType: "string", isRequired: true, description: "Min 8 characters", example: "securePass123" },
    ],
  });
  await prisma.apiRouteResponse.createMany({
    data: [
      { routeId: registerRoute.id, statusCode: 201, description: "Account created successfully", exampleJson: '{\n  "user": { "id": "cuid123", "name": "John Doe", "email": "john@example.com" },\n  "accessToken": "eyJhbG...",\n  "refreshToken": "eyJhbG..."\n}' },
      { routeId: registerRoute.id, statusCode: 409, description: "Email already exists", exampleJson: '{ "error": "Email already registered" }' },
      { routeId: registerRoute.id, statusCode: 422, description: "Validation error", exampleJson: '{ "error": "Password must be at least 8 characters" }' },
    ],
  });

  const loginRoute = await prisma.apiRoute.create({
    data: {
      groupId: authGroup.id, method: HttpMethod.POST, path: "/login",
      summary: "Authenticate and get tokens", description: "Verifies credentials, returns access + refresh tokens.",
      authRequired: false, status: ApiRouteStatus.STABLE, createdById: admin.id,
    },
  });
  await prisma.apiParameter.createMany({
    data: [
      { routeId: loginRoute.id, location: ApiParameterLocation.BODY, name: "email", dataType: "string", isRequired: true, example: "admin@team.com" },
      { routeId: loginRoute.id, location: ApiParameterLocation.BODY, name: "password", dataType: "string", isRequired: true, example: "adminabdo123" },
    ],
  });
  await prisma.apiRouteResponse.createMany({
    data: [
      { routeId: loginRoute.id, statusCode: 200, description: "Login successful", exampleJson: '{\n  "user": { "id": "cuid123", "name": "Abdo Admin", "email": "admin@team.com" },\n  "accessToken": "eyJhbG...",\n  "refreshToken": "eyJhbG..."\n}' },
      { routeId: loginRoute.id, statusCode: 401, description: "Invalid credentials", exampleJson: '{ "error": "Invalid email or password" }' },
    ],
  });

  // Products group
  const productsGroup = await prisma.apiGroup.create({
    data: { projectId: project.id, name: "Products", prefix: "/api/products", description: "Product catalog CRUD with search and filtering", sortOrder: 1 },
  });

  const listProductsRoute = await prisma.apiRoute.create({
    data: {
      groupId: productsGroup.id, method: HttpMethod.GET, path: "/",
      summary: "List products with pagination", description: "Returns paginated product list. Supports search, category filter, and price range.",
      authRequired: false, status: ApiRouteStatus.STABLE, createdById: editor.id,
    },
  });
  await prisma.apiParameter.createMany({
    data: [
      { routeId: listProductsRoute.id, location: ApiParameterLocation.QUERY, name: "page", dataType: "integer", isRequired: false, description: "Page number (default: 1)", example: "1" },
      { routeId: listProductsRoute.id, location: ApiParameterLocation.QUERY, name: "limit", dataType: "integer", isRequired: false, description: "Items per page (default: 20, max: 100)", example: "20" },
      { routeId: listProductsRoute.id, location: ApiParameterLocation.QUERY, name: "search", dataType: "string", isRequired: false, description: "Full-text search on name and description" },
      { routeId: listProductsRoute.id, location: ApiParameterLocation.QUERY, name: "category", dataType: "string", isRequired: false, description: "Filter by category slug" },
      { routeId: listProductsRoute.id, location: ApiParameterLocation.QUERY, name: "min_price", dataType: "number", isRequired: false, example: "10" },
      { routeId: listProductsRoute.id, location: ApiParameterLocation.QUERY, name: "max_price", dataType: "number", isRequired: false, example: "500" },
    ],
  });
  await prisma.apiRouteResponse.create({
    data: { routeId: listProductsRoute.id, statusCode: 200, description: "Paginated product list", exampleJson: '{\n  "products": [\n    { "id": 1, "name": "Wireless Headphones", "price": 79.99, "stock_quantity": 150 }\n  ],\n  "pagination": { "page": 1, "limit": 20, "total": 243, "totalPages": 13 }\n}' },
  });

  const createProductRoute = await prisma.apiRoute.create({
    data: {
      groupId: productsGroup.id, method: HttpMethod.POST, path: "/",
      summary: "Create a new product", description: "Sellers and admins can create new products in the catalog.",
      authRequired: true, roleRequired: "SELLER,ADMIN", status: ApiRouteStatus.STABLE, createdById: editor.id,
    },
  });
  await prisma.apiParameter.createMany({
    data: [
      { routeId: createProductRoute.id, location: ApiParameterLocation.BODY, name: "name", dataType: "string", isRequired: true, example: "Wireless Headphones Pro" },
      { routeId: createProductRoute.id, location: ApiParameterLocation.BODY, name: "category_id", dataType: "integer", isRequired: true, example: "5" },
      { routeId: createProductRoute.id, location: ApiParameterLocation.BODY, name: "price", dataType: "number", isRequired: true, example: "79.99" },
      { routeId: createProductRoute.id, location: ApiParameterLocation.BODY, name: "description", dataType: "string", isRequired: false },
      { routeId: createProductRoute.id, location: ApiParameterLocation.BODY, name: "stock_quantity", dataType: "integer", isRequired: false, example: "100" },
      { routeId: createProductRoute.id, location: ApiParameterLocation.HEADER, name: "Authorization", dataType: "string", isRequired: true, example: "Bearer eyJhbG..." },
    ],
  });
  await prisma.apiRouteResponse.createMany({
    data: [
      { routeId: createProductRoute.id, statusCode: 201, description: "Product created", exampleJson: '{\n  "product": {\n    "id": 42,\n    "name": "Wireless Headphones Pro",\n    "slug": "wireless-headphones-pro",\n    "price": 79.99,\n    "stock_quantity": 100,\n    "is_published": false\n  }\n}' },
      { routeId: createProductRoute.id, statusCode: 401, description: "Not authenticated" },
      { routeId: createProductRoute.id, statusCode: 403, description: "Insufficient role" },
    ],
  });

  const getProductRoute = await prisma.apiRoute.create({
    data: { groupId: productsGroup.id, method: HttpMethod.GET, path: "/:id", summary: "Get product by ID", authRequired: false, status: ApiRouteStatus.STABLE, createdById: editor.id },
  });
  await prisma.apiParameter.create({
    data: { routeId: getProductRoute.id, location: ApiParameterLocation.PATH, name: "id", dataType: "integer", isRequired: true, example: "42" },
  });

  const updateProductRoute = await prisma.apiRoute.create({
    data: { groupId: productsGroup.id, method: HttpMethod.PUT, path: "/:id", summary: "Update product", authRequired: true, status: ApiRouteStatus.STABLE, createdById: editor.id },
  });
  await prisma.apiParameter.createMany({
    data: [
      { routeId: updateProductRoute.id, location: ApiParameterLocation.PATH, name: "id", dataType: "integer", isRequired: true, example: "42" },
      { routeId: updateProductRoute.id, location: ApiParameterLocation.BODY, name: "name", dataType: "string", isRequired: false },
      { routeId: updateProductRoute.id, location: ApiParameterLocation.BODY, name: "price", dataType: "number", isRequired: false },
      { routeId: updateProductRoute.id, location: ApiParameterLocation.BODY, name: "stock_quantity", dataType: "integer", isRequired: false },
      { routeId: updateProductRoute.id, location: ApiParameterLocation.BODY, name: "is_published", dataType: "boolean", isRequired: false },
    ],
  });

  const deleteProductRoute = await prisma.apiRoute.create({
    data: { groupId: productsGroup.id, method: HttpMethod.DELETE, path: "/:id", summary: "Delete product", authRequired: true, roleRequired: "ADMIN", status: ApiRouteStatus.STABLE, createdById: admin.id },
  });
  await prisma.apiParameter.create({
    data: { routeId: deleteProductRoute.id, location: ApiParameterLocation.PATH, name: "id", dataType: "integer", isRequired: true, example: "42" },
  });

  // Orders group
  const ordersGroup = await prisma.apiGroup.create({
    data: { projectId: project.id, name: "Orders", prefix: "/api/orders", description: "Order placement, tracking, and management", sortOrder: 2 },
  });

  const createOrderRoute = await prisma.apiRoute.create({
    data: {
      groupId: ordersGroup.id, method: HttpMethod.POST, path: "/",
      summary: "Place a new order", description: "Creates an order from the cart, calculates totals, initiates payment.",
      authRequired: true, status: ApiRouteStatus.STABLE, createdById: admin.id,
    },
  });
  await prisma.apiParameter.createMany({
    data: [
      { routeId: createOrderRoute.id, location: ApiParameterLocation.BODY, name: "items", dataType: "array", isRequired: true, description: "Array of { product_id, quantity }", example: '[{"product_id": 42, "quantity": 2}]' },
      { routeId: createOrderRoute.id, location: ApiParameterLocation.BODY, name: "shipping_address", dataType: "object", isRequired: true, example: '{"street": "123 Main St", "city": "Cairo", "zip": "11511"}' },
    ],
  });
  await prisma.apiRouteResponse.createMany({
    data: [
      { routeId: createOrderRoute.id, statusCode: 201, description: "Order placed successfully", exampleJson: '{\n  "order": {\n    "id": 1001,\n    "order_number": "ORD-20260407-001",\n    "status": "PENDING",\n    "total": 159.98,\n    "items": [{ "product_id": 42, "quantity": 2, "unit_price": 79.99 }]\n  }\n}' },
      { routeId: createOrderRoute.id, statusCode: 400, description: "Insufficient stock", exampleJson: '{ "error": "Product #42 only has 1 item in stock" }' },
    ],
  });

  const listOrdersRoute = await prisma.apiRoute.create({
    data: { groupId: ordersGroup.id, method: HttpMethod.GET, path: "/", summary: "List user orders", authRequired: true, status: ApiRouteStatus.STABLE, createdById: admin.id },
  });
  await prisma.apiParameter.createMany({
    data: [
      { routeId: listOrdersRoute.id, location: ApiParameterLocation.QUERY, name: "status", dataType: "string", isRequired: false, description: "Filter by order status" },
      { routeId: listOrdersRoute.id, location: ApiParameterLocation.QUERY, name: "page", dataType: "integer", isRequired: false, example: "1" },
    ],
  });

  const getOrderRoute = await prisma.apiRoute.create({
    data: { groupId: ordersGroup.id, method: HttpMethod.GET, path: "/:id", summary: "Get order details", authRequired: true, status: ApiRouteStatus.STABLE, createdById: admin.id },
  });
  await prisma.apiParameter.create({
    data: { routeId: getOrderRoute.id, location: ApiParameterLocation.PATH, name: "id", dataType: "integer", isRequired: true, example: "1001" },
  });

  const updateOrderStatusRoute = await prisma.apiRoute.create({
    data: { groupId: ordersGroup.id, method: HttpMethod.PATCH, path: "/:id/status", summary: "Update order status", description: "Admin-only. Transitions order through PENDING → PAID → SHIPPED → DELIVERED.", authRequired: true, roleRequired: "ADMIN", status: ApiRouteStatus.STABLE, createdById: admin.id },
  });
  await prisma.apiParameter.createMany({
    data: [
      { routeId: updateOrderStatusRoute.id, location: ApiParameterLocation.PATH, name: "id", dataType: "integer", isRequired: true },
      { routeId: updateOrderStatusRoute.id, location: ApiParameterLocation.BODY, name: "status", dataType: "string", isRequired: true, example: "SHIPPED" },
    ],
  });

  // Reviews group
  const reviewsGroup = await prisma.apiGroup.create({
    data: { projectId: project.id, name: "Reviews", prefix: "/api/products/:productId/reviews", description: "Product review and rating endpoints", sortOrder: 3 },
  });

  await prisma.apiRoute.create({
    data: { groupId: reviewsGroup.id, method: HttpMethod.GET, path: "/", summary: "List reviews for a product", authRequired: false, status: ApiRouteStatus.STABLE, createdById: editor.id },
  });

  const createReviewRoute = await prisma.apiRoute.create({
    data: { groupId: reviewsGroup.id, method: HttpMethod.POST, path: "/", summary: "Submit a product review", authRequired: true, status: ApiRouteStatus.DRAFT, createdById: editor.id },
  });
  await prisma.apiParameter.createMany({
    data: [
      { routeId: createReviewRoute.id, location: ApiParameterLocation.BODY, name: "rating", dataType: "integer", isRequired: true, description: "1 to 5", example: "5" },
      { routeId: createReviewRoute.id, location: ApiParameterLocation.BODY, name: "title", dataType: "string", isRequired: false, example: "Amazing product!" },
      { routeId: createReviewRoute.id, location: ApiParameterLocation.BODY, name: "body", dataType: "string", isRequired: false, example: "Great quality and fast shipping." },
    ],
  });

  /* ────────────────────────────────────
   *  COMMENTS
   * ──────────────────────────────────── */
  console.log("Creating comments…");

  const comment1 = await prisma.comment.create({
    data: { projectId: project.id, commentableType: CommentableType.ERD_TABLE, commentableId: usersTable.id, userId: editor.id, body: "Should we add a phone_number column? Many e-commerce platforms use SMS for 2FA and delivery notifications." },
  });
  await prisma.comment.create({
    data: { projectId: project.id, commentableType: CommentableType.ERD_TABLE, commentableId: usersTable.id, userId: admin.id, body: "Good idea! Let's add it as nullable VARCHAR(20). We can make it required later when we implement SMS verification.", parentId: comment1.id },
  });

  await prisma.comment.create({
    data: { projectId: project.id, commentableType: CommentableType.ERD_TABLE, commentableId: productsTable.id, userId: commenter.id, body: "The products table looks solid. Consider adding a 'tags' JSON column for flexible product tagging without a separate many-to-many table." },
  });

  await prisma.comment.create({
    data: { projectId: project.id, commentableType: CommentableType.ERD_TABLE, commentableId: ordersTable.id, userId: viewer.id, body: "The shipping_address as JSON is smart for flexibility, but should we also store billing address separately?" },
  });

  const apiComment = await prisma.comment.create({
    data: { projectId: project.id, commentableType: CommentableType.API_ROUTE, commentableId: createOrderRoute.id, userId: commenter.id, body: "The order creation endpoint should validate stock availability atomically to prevent overselling under concurrent requests." },
  });
  await prisma.comment.create({
    data: { projectId: project.id, commentableType: CommentableType.API_ROUTE, commentableId: createOrderRoute.id, userId: admin.id, body: "Agreed. We'll use a database transaction with SELECT FOR UPDATE on the product stock rows.", parentId: apiComment.id },
  });

  await prisma.comment.create({
    data: { projectId: project.id, commentableType: CommentableType.API_ROUTE, commentableId: loginRoute.id, userId: editor.id, body: "Should we add rate limiting on the login endpoint? Like max 5 attempts per minute per IP to prevent brute force." },
  });

  /* ────────────────────────────────────
   *  ACTIVITY LOGS
   * ──────────────────────────────────── */
  console.log("Creating activity logs…");

  const now = Date.now();
  const activities = [
    { userId: admin.id, action: "created", entityType: "project", entityId: project.id, newValues: { name: "E-Commerce Platform" }, offset: 7200000 },
    { userId: admin.id, action: "created", entityType: "erd_table", entityId: usersTable.id, newValues: { name: "users" }, offset: 6800000 },
    { userId: admin.id, action: "created", entityType: "erd_table", entityId: categoriesTable.id, newValues: { name: "categories" }, offset: 6600000 },
    { userId: editor.id, action: "created", entityType: "erd_table", entityId: productsTable.id, newValues: { name: "products" }, offset: 6000000 },
    { userId: admin.id, action: "created", entityType: "erd_table", entityId: ordersTable.id, newValues: { name: "orders" }, offset: 5500000 },
    { userId: admin.id, action: "created", entityType: "erd_table", entityId: orderItemsTable.id, newValues: { name: "order_items" }, offset: 5000000 },
    { userId: editor.id, action: "created", entityType: "erd_table", entityId: reviewsTable.id, newValues: { name: "reviews" }, offset: 4500000 },
    { userId: admin.id, action: "created", entityType: "api_group", entityId: authGroup.id, newValues: { name: "Authentication" }, offset: 4000000 },
    { userId: admin.id, action: "created", entityType: "api_route", entityId: registerRoute.id, newValues: { method: "POST", path: "/register" }, offset: 3800000 },
    { userId: admin.id, action: "created", entityType: "api_route", entityId: loginRoute.id, newValues: { method: "POST", path: "/login" }, offset: 3600000 },
    { userId: editor.id, action: "created", entityType: "api_group", entityId: productsGroup.id, newValues: { name: "Products" }, offset: 3200000 },
    { userId: editor.id, action: "created", entityType: "api_route", entityId: listProductsRoute.id, newValues: { method: "GET", path: "/" }, offset: 3000000 },
    { userId: editor.id, action: "created", entityType: "api_route", entityId: createProductRoute.id, newValues: { method: "POST", path: "/" }, offset: 2800000 },
    { userId: admin.id, action: "created", entityType: "api_group", entityId: ordersGroup.id, newValues: { name: "Orders" }, offset: 2500000 },
    { userId: admin.id, action: "created", entityType: "api_route", entityId: createOrderRoute.id, newValues: { method: "POST", path: "/" }, offset: 2300000 },
    { userId: editor.id, action: "updated", entityType: "api_route", entityId: listProductsRoute.id, newValues: { status: "STABLE" }, offset: 1800000 },
    { userId: commenter.id, action: "created", entityType: "comment", entityId: comment1.id, newValues: { body: "Should we add phone_number?" }, offset: 1200000 },
    { userId: admin.id, action: "updated", entityType: "erd_table", entityId: productsTable.id, newValues: { description: "Updated description" }, offset: 600000 },
  ];

  await prisma.activityLog.createMany({
    data: activities.map((a) => ({
      projectId: project.id,
      userId: a.userId,
      action: a.action,
      entityType: a.entityType,
      entityId: a.entityId,
      newValues: a.newValues ?? undefined,
      createdAt: new Date(now - a.offset),
    })),
  });

  /* ────────────────────────────────────
   *  NOTIFICATIONS
   * ──────────────────────────────────── */
  console.log("Creating notifications…");

  await prisma.notification.createMany({
    data: [
      { userId: admin.id, type: "comment", title: "New comment on users table", body: "Sara Editor commented: Should we add a phone_number column?", data: { projectId: project.id, tableId: usersTable.id } },
      { userId: admin.id, type: "member_joined", title: "New team member", body: "Casey Commenter joined the project as COMMENTER", data: { projectId: project.id } },
      { userId: editor.id, type: "comment_reply", title: "Abdo Admin replied to your comment", body: "Good idea! Let's add it as nullable VARCHAR(20).", data: { projectId: project.id, commentId: comment1.id } },
      { userId: viewer.id, type: "project_update", title: "Project updated", body: "E-Commerce Platform has new API documentation added", data: { projectId: project.id } },
      { userId: commenter.id, type: "comment_reply", title: "Abdo Admin replied", body: "We'll use a database transaction with SELECT FOR UPDATE.", data: { projectId: project.id, commentId: apiComment.id } },
    ],
  });

  /* ────────────────────────────────────
   *  PERMISSIONS
   * ──────────────────────────────────── */
  console.log("Seeding permissions…");

  await prisma.projectPermission.createMany({
    data: [
      { projectId: project.id, userId: viewer.id, resource: PermissionResource.ERD, action: PermissionAction.VIEW, grantedById: admin.id },
      { projectId: project.id, userId: viewer.id, resource: PermissionResource.API, action: PermissionAction.VIEW, grantedById: admin.id },
      { projectId: project.id, userId: editor.id, resource: PermissionResource.EXPORTS, action: PermissionAction.EDIT, grantedById: admin.id },
      { projectId: project.id, userId: editor.id, resource: PermissionResource.API, action: PermissionAction.DELETE, grantedById: admin.id },
      { projectId: project.id, userId: commenter.id, resource: PermissionResource.COMMENTS, action: PermissionAction.CREATE, grantedById: admin.id },
      { projectId: project.id, userId: commenter.id, resource: PermissionResource.EXPORTS, action: PermissionAction.VIEW, grantedById: admin.id },
    ],
  });

  /* ────────────────────────────────────
   *  DONE
   * ──────────────────────────────────── */
  console.log("\n=== Seed Complete ===\n");
  console.log("Project:", project.name, `(${project.slug})`, "id:", project.id);
  console.log("\nData created:");
  console.log("  6 ERD tables with columns and 8 relations");
  console.log("  4 API groups, 13 routes with parameters and responses");
  console.log("  7 comments (with replies)");
  console.log("  18 activity log entries");
  console.log("  5 notifications");
  console.log("  6 permission grants");
  console.log("\nLog in with any account; password for all:", SEED_PASSWORD);
  console.log("\nAccounts:");
  for (const u of USERS) {
    console.log(`  ${u.email}  →  ${u.name}`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
