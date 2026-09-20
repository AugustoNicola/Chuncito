% Tests de src/victoria.pl: evento de ganar una mano.

:- begin_tests(victoria).

manoGanadoraDePrueba([
    pareja(n, n), triC(m1, m1, m1), escC(p2, p3, p4), triC(s5, s5, s5), escC(s6, s7, s8)
]).

manoConLlamadaDePrueba([
    pareja(n, n), pon(m1, m1, m1), escC(p2, p3, p4), triC(s5, s5, s5), escC(s6, s7, s8)
]).

test(modo_victoria_valido, all(M == [ron, tsumo])) :- modoVictoriaValido(M).

test(victoria_valida_ron) :-
    manoGanadoraDePrueba(Formas),
    once(victoriaValida(victoria(Formas, n, ron))).

test(victoria_valida_tsumo) :-
    manoGanadoraDePrueba(Formas),
    once(victoriaValida(victoria(Formas, n, tsumo))).

test(victoria_invalida_modo_desconocido) :-
    manoGanadoraDePrueba(Formas),
    \+ victoriaValida(victoria(Formas, n, robo)).

test(victoria_invalida_ficha_ganadora_ausente) :-
    manoGanadoraDePrueba(Formas),
    \+ victoriaValida(victoria(Formas, m9, ron)).

test(victoria_invalida_formas_incompletas) :-
    \+ victoriaValida(victoria([pareja(n, n), triC(m1, m1, m1)], n, ron)).

test(victoria_invalida_sin_par) :-
    \+ victoriaValida(victoria(
        [triC(m1, m1, m1), triC(p2, p2, p2), triC(s5, s5, s5), escC(s6, s7, s8), escC(m2, m3, m4)],
        m1, ron)).

test(victoria_valida_ficha_ganadora_desde_el_par) :-
    manoConLlamadaDePrueba(Formas),
    once(victoriaValida(victoria(Formas, n, ron))).

test(victoria_invalida_ficha_ganadora_desde_llamada) :-
    manoConLlamadaDePrueba(Formas),
    \+ victoriaValida(victoria(Formas, m1, ron)).

:- end_tests(victoria).
