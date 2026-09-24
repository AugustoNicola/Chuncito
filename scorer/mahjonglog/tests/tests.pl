:- module(test_hand, []).

% Carga el archivo a testear (mahjong.pl es un archivo consultado, no un módulo)
:- ensure_loaded('../src/mahjong').

% Cada archivo de tests corresponde a un archivo de src/ del mismo nombre.
:- ensure_loaded(fichas_tests).
:- ensure_loaded(juegos_tests).
:- ensure_loaded(orden_tests).
:- ensure_loaded(formas_tests).
:- ensure_loaded(forma_mano_ganadora_tests).
:- ensure_loaded(victoria_tests).
:- ensure_loaded(situacion_tests).
:- ensure_loaded(reglas_tests).
:- ensure_loaded(yakus_tests).
:- ensure_loaded(yakus_aplicables_tests).
:- ensure_loaded(puntuacion_tests).
:- ensure_loaded(puntuacion_matriz_tests).
:- ensure_loaded(resultado_tests).
