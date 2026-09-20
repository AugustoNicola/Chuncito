% Tests de src/fichas.pl: definición de fichas, clasificación e igualdad.

:- begin_tests(fichas).

test(palo_man) :- palo(man, m5).
test(palo_pin) :- palo(pin, p5).
test(palo_sou) :- palo(sou, s5).
test(palo_honor_viento) :- palo(honor, n).
test(palo_honor_dragon) :- palo(honor, r).

test(viento_miembros, all(F == [n, s, e, w])) :-
    viento(F).
test(dragon_miembros, all(F == [r, g, wh])) :-
    dragon(F).

test(redfive_man) :- redfive(m5R).
test(redfive_pin) :- redfive(p5R).
test(redfive_sou) :- redfive(s5R).
test(no_es_redfive) :- \+ redfive(m5).

test(numero_valor) :- numero(7, p7).
test(numero_redfive_conserva_numero) :- numero(5, m5R).

test(ficha_normal_es_ficha) :- ficha(m1).
test(ficha_honor_es_ficha) :- ficha(r).

test(viento_correspondiente_norte) :- vientoCorrespondiente(n, norte).
test(viento_correspondiente_sur) :- vientoCorrespondiente(s, sur).
test(viento_correspondiente_este) :- vientoCorrespondiente(e, este).
test(viento_correspondiente_oeste) :- vientoCorrespondiente(w, oeste).

:- end_tests(fichas).

% ===================== normal / terminal / simple =====================

:- begin_tests(clasificacion).

test(normal_man) :- once(normal(m1)).
test(normal_pin) :- once(normal(p9)).
test(normal_sou) :- once(normal(s5)).
test(normal_excluye_honor) :- \+ normal(r).

test(terminal_bajo) :- once(terminal(m1)).
test(terminal_alto) :- terminal(s9).
test(terminal_excluye_medio) :- \+ terminal(p5).

test(simple_medio) :- simple(p5).
test(simple_excluye_terminal) :- \+ simple(m1).

:- end_tests(clasificacion).

% ===================== igualdad de fichas (===) =====================

:- begin_tests(igualdad).

test(misma_ficha_es_igual) :- m3 === m3.
test(mismo_numero_mismo_palo_es_igual) :- m5 === m5.
test(redfive_igual_a_normal) :- m5 === m5R.
test(honor_igual_a_si_mismo) :- once(r === r).
test(distintos_honores_no_son_iguales) :- \+ (r === g).
test(distinto_palo_no_es_igual) :- \+ (m5 === p5).
test(distinto_numero_no_es_igual) :- \+ (m3 === m4).

:- end_tests(igualdad).
