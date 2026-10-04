import os
from getpass import getpass

from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError
from django.core.validators import validate_email
from django.db import transaction

from works.authentication import username_for_email
from works.models import AccessProfile


class Command(BaseCommand):
    help = "Cria ou activa a conta individual do primeiro gestor da plataforma."

    def add_arguments(self, parser):
        parser.add_argument("--email")
        parser.add_argument("--name")
        parser.add_argument(
            "--password-env",
            help="Nome da variável de ambiente que contém a palavra-passe.",
        )
        parser.add_argument(
            "--confirmation-env",
            help="Nome da variável de ambiente que contém a confirmação.",
        )

    def handle(self, *args, **options):
        option_names = ("email", "name", "password_env", "confirmation_env")
        provided = [options[name] is not None for name in option_names]
        if any(provided):
            if not all(provided):
                raise CommandError(
                    "Forneça --email, --name, --password-env e "
                    "--confirmation-env em conjunto."
                )
            if options["password_env"] == options["confirmation_env"]:
                raise CommandError(
                    "Use variáveis diferentes para a palavra-passe e a confirmação."
                )

            email = options["email"].strip().lower()
            name = options["name"].strip()
            password = os.environ.get(options["password_env"])
            confirmation = os.environ.get(options["confirmation_env"])
            if password is None or confirmation is None:
                raise CommandError(
                    "As variáveis de palavra-passe e confirmação devem estar definidas."
                )
        else:
            email = input("E-mail do gestor: ").strip().lower()
            name = input("Nome do gestor: ").strip()
            password = getpass("Palavra-passe individual: ")
            confirmation = getpass("Confirme a palavra-passe: ")

        try:
            validate_email(email)
        except ValidationError as exc:
            raise CommandError("Indique um endereço de e-mail válido.") from exc
        if not name or len(name) > 160:
            raise CommandError("O nome deve ter entre 1 e 160 caracteres.")
        if password != confirmation:
            raise CommandError("As palavras-passe não coincidem.")

        User = get_user_model()
        matches = list(User.objects.filter(email__iexact=email)[:2])
        if len(matches) > 1:
            raise CommandError(
                "Existem várias contas com este e-mail. Resolva a duplicação antes."
            )
        user = matches[0] if matches else User(
            username=username_for_email(email),
            email=email,
        )
        user.first_name = name[:150]
        try:
            validate_password(password, user=user)
        except ValidationError as exc:
            raise CommandError(" ".join(exc.messages)) from exc

        with transaction.atomic():
            user.email = email
            user.first_name = name[:150]
            user.is_active = True
            user.is_staff = True
            user.is_superuser = True
            user.set_password(password)
            user.save()

            profile = AccessProfile.objects.filter(user=user).first()
            if profile is None:
                profile = AccessProfile.objects.create(
                    user=user,
                    nome=name,
                    email=email,
                    role=AccessProfile.Role.GESTOR,
                    activo=True,
                )
            else:
                profile.nome = name
                profile.email = email
                profile.role = AccessProfile.Role.GESTOR
                profile.activo = True
                profile.save(
                    update_fields=[
                        "nome",
                        "email",
                        "role",
                        "activo",
                        "actualizado_em",
                    ]
                )

        self.stdout.write(
            self.style.SUCCESS(
                f"Conta de gestor preparada para {email}. A palavra-passe não foi exibida."
            )
        )