import swaggerJSDoc from "swagger-jsdoc";

export const buildSwaggerSpec = () =>
  swaggerJSDoc({
    definition: {
      openapi: "3.0.0",
      info: {
        title: "Taxi Office API",
        version: "1.0.0",
        description: "Production-ready taxi office management API"
      },
      components: {
        securitySchemes: {
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "JWT"
          }
        }
      }
    },
    apis: ["src/modules/**/*.routes.ts"]
  });
