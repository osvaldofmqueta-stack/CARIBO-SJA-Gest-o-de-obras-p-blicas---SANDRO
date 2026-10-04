from django.urls import path

from .auth_views import auth_login, auth_logout, auth_session, change_password, csrf_token
from .access_views import AccessUserDetailView, AccessUsersView
from .progress_views import (
    ClientObraDetailView,
    ClientObrasView,
    ObraActualizacoesView,
    ObraFotoLocalUploadView,
    ObraFotoUploadUrlView,
    ObraFotoView,
)
from .views import (
    AccessProfileView,
    DashboardView,
    FiscalizacaoDetailView,
    FiscalizacaoListCreateView,
    HealthView,
    ObraDetailView,
    ObraListCreateView,
    OcorrenciaDetailView,
    OcorrenciaListCreateView,
)

urlpatterns = [
    path("healthz", HealthView.as_view(), name="health"),
    path("auth/csrf", csrf_token, name="auth-csrf"),
    path("auth/session", auth_session, name="auth-session"),
    path("auth/login", auth_login, name="auth-login"),
    path("auth/logout", auth_logout, name="auth-logout"),
    path("auth/password", change_password, name="auth-password"),
    path("me", AccessProfileView.as_view(), name="access-profile"),
    path("access-users", AccessUsersView.as_view(), name="access-users"),
    path(
        "access-users/<int:user_id>",
        AccessUserDetailView.as_view(),
        name="access-user-detail",
    ),
    path("dashboard", DashboardView.as_view(), name="dashboard"),
    path("client/obras", ClientObrasView.as_view(), name="client-obras"),
    path(
        "client/obras/<int:obra_id>",
        ClientObraDetailView.as_view(),
        name="client-obra-detail",
    ),
    path("obras", ObraListCreateView.as_view(), name="obras"),
    path("obras/<int:pk>", ObraDetailView.as_view(), name="obra-detail"),
    path(
        "obras/<int:obra_id>/actualizacoes",
        ObraActualizacoesView.as_view(),
        name="obra-progress-updates",
    ),
    path(
        "obras/<int:obra_id>/actualizacoes/upload-url",
        ObraFotoUploadUrlView.as_view(),
        name="obra-progress-upload-url",
    ),
    path(
        "obras/<int:obra_id>/actualizacoes/upload-local",
        ObraFotoLocalUploadView.as_view(),
        name="obra-progress-upload-local",
    ),
    path(
        "obras/<int:obra_id>/actualizacoes/<int:actualizacao_id>/fotos/<int:foto_id>",
        ObraFotoView.as_view(),
        name="obra-progress-photo",
    ),
    path(
        "fiscalizacoes",
        FiscalizacaoListCreateView.as_view(),
        name="fiscalizacoes",
    ),
    path(
        "fiscalizacoes/<int:pk>",
        FiscalizacaoDetailView.as_view(),
        name="fiscalizacao-detail",
    ),
    path("ocorrencias", OcorrenciaListCreateView.as_view(), name="ocorrencias"),
    path(
        "ocorrencias/<int:pk>",
        OcorrenciaDetailView.as_view(),
        name="ocorrencia-detail",
    ),
]