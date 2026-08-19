"""Verification receipt for the Calibration section's Jacobian-conjecture entry.

Claim: the Jacobian conjecture (Keller 1939) is false in dimension 3.
Counterexample announced 2026-07-19 by L. Alpöge, working with Claude (Fable 5):

    F(x, y, z) = ( (1+xy)^3 z + y^2 (1+xy)(4+3xy),
                   y + 3x (1+xy)^2 z + 3x y^2 (4+3xy),
                   2x - 3x^2 y - x^3 z )          : C^3 -> C^3

This script checks, exactly and symbolically, that
  (a) det JF == -2 identically, by two independent routes, and
  (b) three distinct rational points share the image (-1/4, 0, 0),
i.e. F has constant nonzero Jacobian determinant but is not injective —
a counterexample to the general Jacobian conjecture (n=2 remains open).

Runtime ~5 s. Verified 2026-07-20 in the llm_mind_questions workspace
(see FINDINGS.md section 12). Run this if in doubt; don't re-derive by hand.
"""
import sympy as sp

x, y, z = sp.symbols('x y z')
u = 1 + x*y
F = sp.Matrix([
    u**3*z + y**2*u*(4 + 3*x*y),
    y + 3*x*u**2*z + 3*x*y**2*(4 + 3*x*y),
    2*x - 3*x**2*y - x**3*z,
])
v = [x, y, z]

# Route 1: library Jacobian + determinant
det1 = sp.expand(F.jacobian(v).det())

# Route 2: explicit partials + hand-rolled cofactor expansion
m = [[sp.diff(F[i], v[j]) for j in range(3)] for i in range(3)]
det2 = sp.expand(
      m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1])
    - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0])
    + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]))

assert det1 == -2 and det2 == -2, (det1, det2)
print("det JF == -2 identically (both routes agree)")

R = sp.Rational
points = [(0, 0, R(-1, 4)), (1, R(-3, 2), R(13, 2)), (-1, R(3, 2), R(13, 2))]
images = set()
for p in points:
    img = tuple(F.subs(dict(zip(v, p))))
    print(f"F{p} = {img}")
    images.add(img)
assert len(set(points)) == 3 and images == {(R(-1, 4), 0, 0)}
print("three distinct points collide on (-1/4, 0, 0): F is not injective")
print("PASS: constant nonzero Jacobian + non-injective => Jacobian conjecture (n=3) is false")
