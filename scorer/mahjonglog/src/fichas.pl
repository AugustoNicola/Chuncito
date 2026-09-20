%* ===================== definiciones atributos de las fichas =====================
%* Nota de convención: en predicados relacionales (Atributo, Ficha), el
%* Atributo va primero para facilitar su uso con aplicación parcial
%* (e.g. call(palo(pin), F), maplist(numero(5), Fichas)).
palo(sou, s1). palo(sou, s2). palo(sou, s3). palo(sou, s4). palo(sou, s5). palo(sou, s5R). palo(sou, s6). palo(sou, s7). palo(sou, s8). palo(sou, s9).
palo(man, m1). palo(man, m2). palo(man, m3). palo(man, m4). palo(man, m5). palo(man, m5R). palo(man, m6). palo(man, m7). palo(man, m8). palo(man, m9).
palo(pin, p1). palo(pin, p2). palo(pin, p3). palo(pin, p4). palo(pin, p5). palo(pin, p5R). palo(pin, p6). palo(pin, p7). palo(pin, p8). palo(pin, p9).
palo(honor, n). palo(honor, s). palo(honor, e). palo(honor, w).
palo(honor, r). palo(honor, g). palo(honor, wh).

redfive(s5R). redfive(m5R). redfive(p5R).

numero(1, s1). numero(2, s2). numero(3, s3). numero(4, s4). numero(5, s5). numero(5, s5R). numero(6, s6). numero(7, s7). numero(8, s8). numero(9, s9).
numero(1, m1). numero(2, m2). numero(3, m3). numero(4, m4). numero(5, m5). numero(5, m5R). numero(6, m6). numero(7, m7). numero(8, m8). numero(9, m9).
numero(1, p1). numero(2, p2). numero(3, p3). numero(4, p4). numero(5, p5). numero(5, p5R). numero(6, p6). numero(7, p7). numero(8, p8). numero(9, p9).

viento(n). viento(s). viento(e). viento(w).
dragon(r). dragon(g). dragon(wh).
honor(F) :- palo(honor, F).

vientoCorrespondiente(n, norte). vientoCorrespondiente(s, sur). vientoCorrespondiente(e, este). vientoCorrespondiente(w, oeste).

normal(F) :- palo(sou, F).
normal(F) :- palo(pin, F).
normal(F) :- palo(man, F).

terminal(F) :- numero(1, F).
terminal(F) :- numero(9, F).

simple(F) :- numero(N, F), between(2,8,N).
noSimple(F) :- palo(honor, F) ; numero(1, F) ; numero(9, F).

validaParaRyuuiisou(g).
validaParaRyuuiisou(F) :- palo(sou, F), numero(N, F), member(N, [2,3,4,6,8]).

ficha(F) :- palo(_, F).

%* ===================== Igualdad de Fichas =====================
:- op(700, xfx, ===).
%! ===(F1, F2) is nondet.
%* Relaciona fichas iguales (en el sentido de compratir palo y número, i.e. servir para un par). No distingue red fives.
F1 === F2 :- palo(honor, F1), !, F1 == F2.
F1 === F2 :- normal(F1), palo(P, F1), numero(N, F1), palo(P, F2), numero(N, F2).
