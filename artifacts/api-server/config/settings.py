import os
from pathlib import Path

import dj_database_url
from django.core.exceptions import ImproperlyConfigured

BASE_DIR = Path(__file__).resolve().parent.parent
DEBUG = os.environ.get("DJANGO_DEBUG", "false").lower() == "true"
SECRET_KEY = os.environ.get("SESSION_SECRET") or os.environ.get("DJANGO_SECRET_KEY")
if not SECRET_KEY:
    if DEBUG:
        SECRET_KEY = "development-only-key-do-not-use-in-production"
    else:
        raise ImproperlyConfigured(
            "SESSION_SECRET or DJANGO_SECRET_KEY must be configured."
        )

ALLOWED_HOSTS = [
    "localhost",
    "127.0.0.1",
    ".replit.dev",
    ".replit.app",
    ".repl.co",
]
configured_domains = os.environ.get("REPLIT_DOMAINS", "")
ALLOWED_HOSTS.extend(
    domain.strip()
    for domain in configured_domains.split(",")
    if domain.strip()
)

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "works.apps.WorksConfig",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
CSRF_TRUSTED_ORIGINS = [
    "https://*.replit.dev",
    "https://*.replit.app",
    "https://*.repl.co",
]
CSRF_TRUSTED_ORIGINS.extend(
    f"https://{domain.strip()}"
    for domain in configured_domains.split(",")
    if domain.strip()
)
preview_domain = os.environ.get("REPLIT_DEV_DOMAIN", "").strip()
cookie_secure_default = not DEBUG and not preview_domain
SESSION_COOKIE_SECURE = (
    os.environ.get("DJANGO_SESSION_COOKIE_SECURE", str(cookie_secure_default)).lower()
    == "true"
)
CSRF_COOKIE_SECURE = SESSION_COOKIE_SECURE
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_SAMESITE = "Lax"

ROOT_URLCONF = "config.urls"
TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    }
]
WSGI_APPLICATION = "config.wsgi.application"

database_url = os.environ.get("CARIBO_DATABASE_URL") or os.environ.get("DATABASE_URL")
if not database_url:
    raise ImproperlyConfigured(
        "CARIBO_DATABASE_URL or DATABASE_URL must be configured for PostgreSQL."
    )
DATABASES = {
    "default": dj_database_url.parse(
        database_url,
        conn_max_age=600,
        conn_health_checks=True,
    )
}

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "pt-ao"
TIME_ZONE = "Africa/Luanda"
USE_I18N = True
USE_TZ = True
STATIC_URL = "static/"
CARIBO_LOCAL = os.environ.get("CARIBO_LOCAL", "").lower() in {"1", "true", "yes"}
if CARIBO_LOCAL:
    local_app_data = os.environ.get("LOCALAPPDATA")
    MEDIA_ROOT = (
        Path(local_app_data) / "CariboSJA" / "media"
        if local_app_data
        else BASE_DIR / ".local-media"
    )
else:
    MEDIA_ROOT = BASE_DIR / ".local-media"
FILE_UPLOAD_MAX_MEMORY_SIZE = 2 * 1024 * 1024
DATA_UPLOAD_MAX_MEMORY_SIZE = 11 * 1024 * 1024
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework.authentication.SessionAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
        "works.permissions.HasActiveAccessProfile",
    ],
    "DEFAULT_RENDERER_CLASSES": [
        "rest_framework.renderers.JSONRenderer",
    ],
    "COERCE_DECIMAL_TO_STRING": False,
}
AUTHENTICATION_BACKENDS = ["works.authentication.EmailBackend"]