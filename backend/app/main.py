import traceback

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager

from app.config import settings
from app.database import init_db
from app.routers import auth, users, resumes, jobs, applications
from app.routers import auto_apply
from app.routers import document_templates as document_templates_router
from app.routers import admin_document_templates as admin_document_templates_router
from app.routers import extension as extension_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(
    title=settings.APP_NAME,
    description="Job application automation platform API",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/v1")
app.include_router(users.router, prefix="/api/v1")
app.include_router(resumes.router, prefix="/api/v1")
app.include_router(jobs.router, prefix="/api/v1")
app.include_router(applications.router, prefix="/api/v1")
app.include_router(auto_apply.router, prefix="/api/v1")
app.include_router(document_templates_router.router, prefix="/api/v1")
app.include_router(admin_document_templates_router.router, prefix="/api/v1")
app.include_router(extension_router.router, prefix="/api/v1")


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """
    Return full diagnostics in dev mode so frontend Network tab
    can show the real backend failure.
    """
    if settings.DEBUG:
        return JSONResponse(
            status_code=500,
            content={
                "detail": str(exc),
                "error_type": exc.__class__.__name__,
                "path": str(request.url.path),
                "traceback": traceback.format_exc(),
            },
        )
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


@app.get("/")
def root():
    return {"service": settings.APP_NAME, "status": "ok", "docs": "/docs"}


@app.get("/health")
def health():
    return {"status": "healthy"}
