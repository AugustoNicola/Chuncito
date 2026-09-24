% Tests de src/situacion.pl: estado de la partida al momento de ganar.

:- begin_tests(situacion).

test(tiene_flag_presente) :- tieneFlag(situacion(este, sur, [], [], [riichi, ippatsu]), ippatsu).
test(tiene_flag_ausente) :- \+ tieneFlag(situacion(este, sur, [], [], [riichi]), ippatsu).
test(tiene_flag_lista_vacia) :- \+ tieneFlag(situacion(este, sur, [], [], []), riichi).

test(viento_valido, all(V == [este, sur, oeste, norte])) :- vientoValido(V).

test(situacion_valida_sin_flags) :- situacionValida(situacion(este, sur, [], [], [])).
test(situacion_valida_con_riichi_ippatsu) :- situacionValida(situacion(este, este, [], [], [riichi, ippatsu])).
test(situacion_valida_con_doble_riichi) :- situacionValida(situacion(oeste, norte, [], [], [dobleRiichi])).

test(situacion_invalida_viento_ronda) :- \+ situacionValida(situacion(centro, sur, [], [], [])).
test(situacion_invalida_viento_jugador) :- \+ situacionValida(situacion(este, centro, [], [], [])).

test(situacion_invalida_flag_no_soportado) :- \+ situacionValida(situacion(este, sur, [], [], [otro])).

test(situacion_invalida_riichi_y_doble_riichi) :-
    \+ situacionValida(situacion(este, sur, [], [], [riichi, dobleRiichi])).
test(situacion_invalida_houtei_y_haitei) :-
    \+ situacionValida(situacion(este, sur, [], [], [houtei, haitei])).
test(situacion_invalida_houtei_y_rinshan) :-
    \+ situacionValida(situacion(este, sur, [], [], [houtei, rinshan])).
test(situacion_invalida_chankan_y_rinshan) :-
    \+ situacionValida(situacion(este, sur, [], [], [chankan, rinshan])).
test(situacion_invalida_chankan_y_haitei) :-
    \+ situacionValida(situacion(este, sur, [], [], [chankan, haitei])).
test(situacion_invalida_haitei_y_rinshan) :-
    % la ficha ganadora es o la última del muro vivo (haitei) o el reemplazo tras un kan (rinshan), nunca ambas
    \+ situacionValida(situacion(este, sur, [], [], [haitei, rinshan])).

test(situacion_invalida_ippatsu_sin_riichi) :-
    \+ situacionValida(situacion(este, sur, [], [], [ippatsu])).
test(situacion_valida_ippatsu_con_doble_riichi) :-
    situacionValida(situacion(este, sur, [], [], [dobleRiichi, ippatsu])).

% ---- doras / ura doras ----

test(situacion_valida_con_doras) :-
    situacionValida(situacion(este, sur, [p5, m1], [], [])).
test(situacion_invalida_dora_no_es_ficha) :-
    \+ situacionValida(situacion(este, sur, [pepe], [], [])).

test(situacion_valida_ura_dora_con_riichi) :-
    situacionValida(situacion(este, sur, [], [p5], [riichi])).
test(situacion_valida_ura_dora_con_doble_riichi) :-
    situacionValida(situacion(este, sur, [], [p5], [dobleRiichi])).
test(situacion_invalida_ura_dora_sin_riichi) :-
    \+ situacionValida(situacion(este, sur, [], [p5], [])).

% ---- primeraRonda (situacional; determina tenhou/chiihou/renhou en yakus.pl) ----

test(situacion_valida_con_firstTurnWin) :- situacionValida(situacion(este, sur, [], [], [primeraRonda])).

test(situacion_invalida_firstTurnWin_y_riichi) :-
    \+ situacionValida(situacion(este, sur, [], [], [primeraRonda, riichi])).
test(situacion_invalida_firstTurnWin_y_doble_riichi) :-
    \+ situacionValida(situacion(este, sur, [], [], [primeraRonda, dobleRiichi])).
test(situacion_invalida_firstTurnWin_y_ippatsu) :-
    \+ situacionValida(situacion(este, sur, [], [], [primeraRonda, ippatsu])).

% ---- riichiAbierto (open riichi): una tercera variante de riichi ----

test(situacion_valida_con_riichi_abierto) :-
    situacionValida(situacion(este, sur, [], [], [riichiAbierto])).
test(situacion_valida_ippatsu_con_riichi_abierto) :-
    situacionValida(situacion(este, sur, [], [], [riichiAbierto, ippatsu])).
test(situacion_valida_ura_dora_con_riichi_abierto) :-
    situacionValida(situacion(este, sur, [], [p5], [riichiAbierto])).
test(situacion_invalida_riichi_y_riichi_abierto) :-
    \+ situacionValida(situacion(este, sur, [], [], [riichi, riichiAbierto])).
test(situacion_invalida_doble_riichi_y_riichi_abierto) :-
    \+ situacionValida(situacion(este, sur, [], [], [riichiAbierto, dobleRiichi])).
test(situacion_invalida_firstTurnWin_y_riichi_abierto) :-
    \+ situacionValida(situacion(este, sur, [], [], [primeraRonda, riichiAbierto])).

test(flag_de_riichi, all(F == [riichi, dobleRiichi, riichiAbierto])) :- flagDeRiichi(F).
test(con_riichi_acepta_cada_variante) :-
    conRiichi([riichi]), conRiichi([dobleRiichi, ippatsu]), conRiichi([haitei, riichiAbierto]).
test(con_riichi_falla_sin_riichi) :- \+ conRiichi([ippatsu, haitei]).

:- end_tests(situacion).
