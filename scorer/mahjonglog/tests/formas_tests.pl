% Tests de src/formas.pl: pares, escaleras, triplas, quads y formas de mano.

:- begin_tests(formas).

% ---- pares ----

test(par_valido) :- par(pareja(n, n)).
test(par_falla_distintas) :- \+ par(pareja(m1, m2)).
test(par_falla_desordenado) :- \+ par(pareja(m2, m1)).

% ---- escaleras: chii (llamada) y escC (oculta) ----

test(chii_valido) :- llamada(chii(m1, m2, m3)).
test(chii_es_escalera) :- escalera(chii(m1, m2, m3)).
test(chii_no_es_oculta) :- \+ oculta(chii(m1, m2, m3)).
test(chii_falla_desordenado) :- \+ llamada(chii(m2, m1, m3)).
test(chii_falla_sin_escalera) :- \+ llamada(chii(m1, m2, m4)).

test(escC_valida) :- oculta(escC(m1, m2, m3)).
test(escC_es_escalera) :- escalera(escC(m1, m2, m3)).
test(escC_no_es_llamada) :- \+ llamada(escC(m1, m2, m3)).

% ---- triplas estrictas: pon (llamada) y triC (oculta) ----

test(pon_valido) :- llamada(pon(n, n, n)).
test(pon_es_tripla) :- tripla(pon(n, n, n)).
test(pon_es_pierna) :- once(pierna(pon(n, n, n))).
test(pon_no_es_quad) :- \+ quad(pon(n, n, n)).
test(pon_es_unico) :-
    findall(x, llamada(pon(n, n, n)), Rs),
    length(Rs, 1).
test(pon_falla_sin_tripla) :- \+ llamada(pon(m1, m1, m2)).

test(triC_valida) :- oculta(triC(m1, m1, m1)).
test(triC_es_tripla) :- tripla(triC(m1, m1, m1)).
test(triC_es_pierna) :- once(pierna(triC(m1, m1, m1))).
test(triC_no_es_llamada) :- \+ llamada(triC(m1, m1, m1)).

% ---- quads: kanA (llamada) y kanC (oculta) ----

test(kanA_valido) :- llamada(kanA(m1, m1, m1, m1)).
test(kanA_es_quad) :- quad(kanA(m1, m1, m1, m1)).
test(kanA_es_pierna) :- pierna(kanA(m1, m1, m1, m1)).
test(kanA_no_es_tripla) :- \+ tripla(kanA(m1, m1, m1, m1)).

test(kanC_valido) :- oculta(kanC(m1, m1, m1, m1)).
test(kanC_es_quad) :- quad(kanC(m1, m1, m1, m1)).
test(kanC_es_pierna) :- pierna(kanC(m1, m1, m1, m1)).
test(kanC_no_es_llamada) :- \+ llamada(kanC(m1, m1, m1, m1)).

test(kan_falla_sin_cuarta_igual) :- \+ oculta(kanC(m1, m1, m1, m2)).

% ---- juego y forma: agregación de las categorías anteriores ----

test(juego_incluye_escalera) :- once(juego(chii(m1, m2, m3))).
test(juego_incluye_tripla) :- once(juego(pon(n, n, n))).
test(juego_incluye_quad) :- once(juego(kanA(m1, m1, m1, m1))).
test(juego_falla_para_par) :- \+ juego(pareja(n, n)).

test(forma_incluye_par) :- once(forma(pareja(n, n))).
test(forma_incluye_juego) :- once(forma(triC(m1, m1, m1))).

:- end_tests(formas).
