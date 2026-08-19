import unittest

from rolling import RollingWindow


class TestRollingWindow(unittest.TestCase):
    def test_partial_window_mean(self):
        w = RollingWindow(4)
        w.push(2)
        w.push(4)
        self.assertEqual(w.mean(), 3)

    def test_window_never_exceeds_size(self):
        w = RollingWindow(3)
        for v in range(10):
            w.push(v)
        self.assertEqual(len(w), 3)

    def test_old_samples_age_out(self):
        w = RollingWindow(3)
        for v in [1, 2, 3, 4, 5]:
            w.push(v)
        # window should now hold the three most recent samples: 3, 4, 5
        self.assertEqual(w.mean(), 4)

    def test_maximum_reflects_current_window(self):
        w = RollingWindow(2)
        w.push(9)
        w.push(1)
        w.push(2)
        # the 9 fell out of the window
        self.assertEqual(w.maximum(), 2)

    def test_empty_window_raises(self):
        w = RollingWindow(2)
        with self.assertRaises(ValueError):
            w.mean()


if __name__ == "__main__":
    unittest.main()
