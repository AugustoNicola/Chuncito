% Tests de src/orden.pl: orden estándar de fichas.

:- begin_tests(orden).

test(orden_por_palo) :- ordenarFichas([s1, m1, p1], [m1, p1, s1]).
test(orden_por_numero) :- ordenarFichas([m3, m1, m2], [m1, m2, m3]).
test(orden_honores) :- ordenarFichas([r, e, n, w, s, g, wh], [e, s, w, n, wh, g, r]).
test(orden_redfive_despues_de_normal) :- ordenarFichas([s5, s5R, s5], [s5, s5, s5R]).
test(orden_conserva_repetidos) :- ordenarFichas([m2, m1, m2, m1], [m1, m1, m2, m2]).
test(orden_mano_mixta) :-
    ordenarFichas([s5, p1, s5R, s5, s1, n], [p1, s1, s5, s5, s5R, n]).

test(fichas_en_orden_verdadero) :- fichasEnOrden([m1, m2, m3]).
test(fichas_en_orden_falso) :- \+ fichasEnOrden([m2, m1, m3]).

:- end_tests(orden).
