#!/usr/bin/env python3
"""Print word frequencies for a text file."""
import argparse
import collections
import re


def main():
    parser = argparse.ArgumentParser(description="Count word frequencies in a file.")
    parser.add_argument("path", help="text file to analyze")
    args = parser.parse_args()

    with open(args.path, encoding="utf-8") as f:
        words = re.findall(r"[a-zA-Z']+", f.read().lower())

    counts = collections.Counter(words)
    for word, n in counts.most_common():
        print(f"{n:6d}  {word}")


if __name__ == "__main__":
    main()
