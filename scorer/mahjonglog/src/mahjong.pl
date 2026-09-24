%* ===================== punto de entrada =====================
%* Carga los archivos que componen el proyecto:
%*   fichas.pl               - definición de fichas e igualdad entre ellas
%*   juegos.pl               - pares, triplas y escaleras
%*   orden.pl                - orden estándar de fichas
%*   formas.pl               - pares, escaleras, triplas, quads y formas de mano
%*   forma_mano_ganadora.pl  - condiciones de mano ganadora
%*   victoria.pl             - evento de ganar una mano
%*   situacion.pl            - estado de la partida al momento de ganar
%*   reglas.pl               - reglas de la casa opcionales con las que se puntúa
%*   yakus.pl                - condiciones de cada yaku
%*   yakus_aplicables.pl     - filtra los yakus solapados/anulados entre sí
%*   puntuacion.pl           - han, fu y pago final de una victoria
%*   resultado.pl            - punto de entrada: elige la mejor descomposición y arma el resultado final

:- use_module(library(pairs)).
:- ensure_loaded(fichas).
:- ensure_loaded(juegos).
:- ensure_loaded(orden).
:- ensure_loaded(formas).
:- ensure_loaded(forma_mano_ganadora).
:- ensure_loaded(victoria).
:- ensure_loaded(situacion).
:- ensure_loaded(reglas).
:- ensure_loaded(yakus).
:- ensure_loaded(yakus_aplicables).
:- ensure_loaded(puntuacion).
:- ensure_loaded(resultado).
